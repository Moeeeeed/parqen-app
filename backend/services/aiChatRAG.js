// ============================================================
// AI Chat RAG Pipeline — retrieves from Supabase kb_articles,
// prefers Groq when configured, falls back to Mistral, and persists conversations.
// ============================================================

const MISTRAL_API_KEY = process.env.MISTRAL_API_KEY;
const GROQ_API_KEY = process.env.GROQ_API_KEY;
const DEFAULT_GROQ_MODEL = process.env.GROQ_MODEL || 'openai/gpt-oss-20b';

// ── Embed a message via Mistral mistral-embed ───────────────────────────
async function embedText(text) {
  if (!MISTRAL_API_KEY) return null;
  try {
    const res = await fetch('https://api.mistral.ai/v1/embeddings', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${MISTRAL_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ model: 'mistral-embed', input: text }),
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) {
      console.error('[ai-chat] Mistral embed error:', res.status);
      return null;
    }
    const data = await res.json();
    return data.data?.[0]?.embedding || null;
  } catch (err) {
    console.error('[ai-chat] Mistral embed failed:', err.message);
    return null;
  }
}

// ── Retrieve relevant KB articles via Supabase ──────────────────────────
// Falls back to topic-filtered text scan if pgvector RPC isn't available.
async function retrieveKBArticles(supabaseAdmin, queryEmbedding, topic, limit = 5) {
  if (!queryEmbedding) {
    // No embedding available — fall back to topic-filtered text search
    let q = supabaseAdmin.from('kb_articles').select('title, content, topic');
    if (topic) q = q.eq('topic', topic);
    const { data } = await q.limit(limit);
    return data || [];
  }

  const embeddingStr = `[${queryEmbedding.join(',')}]`;

  try {
    // Try RPC call for cosine similarity search (requires pgvector + a match function)
    const { data, error } = await supabaseAdmin.rpc('match_kb_articles', {
      query_embedding: embeddingStr,
      match_count: limit,
      filter_topic: topic || null,
    }).single();

    if (error || !data) {
      // RPC not created — fall back to topic filter + limit
      let q = supabaseAdmin.from('kb_articles').select('title, content, topic');
      if (topic) q = q.eq('topic', topic);
      const { data: fallback } = await q.limit(limit);
      return fallback || [];
    }

    return Array.isArray(data) ? data : [data];
  } catch {
    // Fallback: just get articles by topic
    let q = supabaseAdmin.from('kb_articles').select('title, content, topic');
    if (topic) q = q.eq('topic', topic);
    const { data: fallback } = await q.limit(limit);
    return fallback || [];
  }
}

// ── Fetch lightweight user context (read-only) ──────────────────────────
async function fetchUserContext(supabaseAdmin, userId) {
  if (!userId) return null;
  try {
    // Only fetch fields already exposed elsewhere in the app
    const { data: user } = await supabaseAdmin
      .from('users')
      .select('username, is_id_verified, is_email_verified, country')
      .eq('id', userId)
      .single();

    if (!user) return null;

    // Count open trades (non-sensitive)
    const { count: openTrades } = await supabaseAdmin
      .from('trades')
      .select('*', { count: 'exact', head: true })
      .or(`buyer_id.eq.${userId},seller_id.eq.${userId}`)
      .in('status', ['pending', 'active', 'payment_sent']);

    return {
      username: user.username,
      isIdVerified: user.is_id_verified,
      isEmailVerified: user.is_email_verified,
      country: user.country,
      openTrades: openTrades || 0,
    };
  } catch {
    return null;
  }
}

// ── Build system prompt with retrieved context ───────────────────────────
function buildRAGSystemPrompt(baseContext, kbArticles, userContext, isSupportChat) {
  let prompt = baseContext;

  // Inject retrieved KB snippets
  if (kbArticles && kbArticles.length > 0) {
    prompt += '\n\n=== RELEVANT KNOWLEDGE BASE ARTICLES ===\n';
    prompt += 'Use these articles to answer the user\'s question. If the articles don\'t cover the question, say so honestly.\n\n';
    kbArticles.forEach((article, i) => {
      prompt += `--- Article ${i + 1}: ${article.title} ---\n${article.content}\n\n`;
    });
  }

  // Inject live user context (support mode only)
  if (userContext && isSupportChat) {
    prompt += '\n=== USER CONTEXT (read-only, do not expose sensitive data) ===\n';
    prompt += `- Username: ${userContext.username}\n`;
    prompt += `- ID verified: ${userContext.isIdVerified ? 'Yes' : 'No'}\n`;
    prompt += `- Email verified: ${userContext.isEmailVerified ? 'Yes' : 'No'}\n`;
    prompt += `- Country: ${userContext.country || 'Unknown'}\n`;
    prompt += `- Open trades: ${userContext.openTrades}\n`;
  }

  // Topic restriction — only answer PRAQEN-related questions
  prompt += `\n=== TOPIC RESTRICTION ===
You are PRAQEN's support AI. You ONLY answer questions related to:
- PRAQEN platform (buying, selling, trading Bitcoin on PRAQEN)
- Account issues (login, password, KYC, profile settings)
- Payment methods (MoMo, bank transfer, gift cards on PRAQEN)
- Wallet and escrow on PRAQEN
- Disputes, refunds, and support tickets on PRAQEN
- PRAQEN fees, referral program, and platform features

If the user asks about ANYTHING else (general knowledge, other websites, unrelated topics), politely decline and redirect them. Example response for off-topic questions:
"I can only help with PRAQEN-related questions. Would you like help with buying/selling Bitcoin, your account, payments, or a support ticket?"

NEVER answer general knowledge questions (capitals, trivia, weather, etc.) even if you know the answer.
=== END TOPIC RESTRICTION ===\n\n=== RESPONSE FORMAT ===
You MUST respond with valid JSON only — no other text before or after.
{
  "reply": "Your conversational reply to the user (2-4 sentences, friendly, use markdown **bold** for key terms)",
  "confidence": 0.0 to 1.0 (how confident you are — 1.0 = directly answered from KB, 0.3 = guessing, 0.0 = don't know),
  "should_escalate": true or false (true if the issue requires human intervention, if you don't know the answer, or if the user seems frustrated/urgent),
  "suggested_priority": "low" | "normal" | "urgent"
}

Rules:
- If the user asks something NOT covered by the knowledge base articles provided, set confidence below 0.5 and should_escalate to true.
- If the user expresses frustration, mentions scams/fraud/stolen funds, or the issue is clearly beyond automated help, set should_escalate to true and suggested_priority to "urgent".
- When should_escalate is true, include a brief note in your reply like "I'll connect you with a human agent" or "Let me escalate this for you".
- NEVER make up account-specific information (balances, transaction IDs, etc.) that wasn't provided in the context.
- Keep replies concise (2-4 sentences).`;

  return prompt;
}

// ── Parse structured JSON from LLM response ─────────────────────────────
function parseStructuredReply(rawText) {
  try {
    // Try to extract JSON from the response (LLM may wrap it in ```json ... ```)
    let cleaned = rawText.trim();
    // Strip markdown code fences
    cleaned = cleaned.replace(/^```(?:json)?\s*\n?/i, '').replace(/\n?```\s*$/i, '');
    const parsed = JSON.parse(cleaned);
    return {
      reply: parsed.reply || "I'm here to help! Could you tell me more?",
      confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 0.5,
      should_escalate: !!parsed.should_escalate,
      suggested_priority: ['low', 'normal', 'urgent'].includes(parsed.suggested_priority)
        ? parsed.suggested_priority : 'normal',
    };
  } catch {
    // Response isn't valid JSON — treat the whole text as the reply
    return {
      reply: rawText?.trim() || "I'm here to help! Could you tell me more?",
      confidence: 0.5,
      should_escalate: false,
      suggested_priority: 'normal',
    };
  }
}

// ── Persist conversation to Supabase ────────────────────────────────────
async function persistConversation(supabaseAdmin, userId, ticketId, mode, userMessage, aiResult) {
  try {
    let sessionId = null;

    if (ticketId) {
      const { data: existing } = await supabaseAdmin
        .from('ai_chat_sessions')
        .select('id')
        .eq('ticket_id', ticketId)
        .eq('mode', mode)
        .maybeSingle();
      if (existing) sessionId = existing.id;
    }

    if (!sessionId && userId) {
      const { data: existing } = await supabaseAdmin
        .from('ai_chat_sessions')
        .select('id')
        .eq('user_id', userId)
        .eq('mode', mode)
        .is('ticket_id', ticketId || null)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (existing) sessionId = existing.id;
    }

    if (!sessionId && userId) {
      const { data: newSession } = await supabaseAdmin
        .from('ai_chat_sessions')
        .insert({ user_id: userId, ticket_id: ticketId || null, mode })
        .select('id')
        .single();
      sessionId = newSession?.id;
    }

    if (!sessionId) return;

    await supabaseAdmin.from('ai_chat_messages').insert({
      session_id: sessionId,
      role: 'user',
      content: userMessage,
    });

    await supabaseAdmin.from('ai_chat_messages').insert({
      session_id: sessionId,
      role: 'ai',
      content: aiResult.reply,
      confidence: aiResult.confidence,
      escalated: aiResult.should_escalate,
      suggested_priority: aiResult.suggested_priority,
    });
  } catch (err) {
    console.error('[ai-chat] Failed to persist conversation:', err.message);
  }
}

// ── Main RAG handler ────────────────────────────────────────────────────
async function handleAIChatRAG(req, res, supabaseAdmin, PRAQEN_SUPPORT_AGENT_CONTEXT, PRAQEN_CONTEXT) {
  const { message, section, history = [], user: chatUser, mode } = req.body;
  if (!message?.trim()) return res.status(400).json({ error: 'Message required' });

  const isSupportChat = mode === 'support';
  const userContext = await fetchUserContext(supabaseAdmin, chatUser?.id);

  // 1. Embed the incoming message
  const queryEmbedding = await embedText(message);

  // 2. Retrieve relevant KB articles
  const kbArticles = await retrieveKBArticles(supabaseAdmin, queryEmbedding, section, 5);

  // 3. Build system prompt with RAG context
  const baseContext = isSupportChat ? PRAQEN_SUPPORT_AGENT_CONTEXT : PRAQEN_CONTEXT;
  const systemPrompt = buildRAGSystemPrompt(baseContext, kbArticles, userContext, isSupportChat);

  // 4. Add user context to prompt if present
  const userPart = chatUser
    ? (isSupportChat
      ? `\n\nYou are speaking with: ${chatUser.username}`
      : (section ? `\n\nThe user selected topic: "${section}". Focus your answer on this area.` : '') +
        `\n\nUser: ${chatUser.username}`)
    : '';

  // 5. Call available LLM (prefer Groq when configured, fall back to Mistral)
  const messages = [
    ...history.slice(-10).map(m => ({
      role: m.role === 'user' ? 'user' : 'assistant',
      content: m.text,
    })),
    { role: 'user', content: message },
  ];

  const providers = [];

  if (GROQ_API_KEY) {
    providers.push({
      name: 'Groq',
      endpoint: 'https://api.groq.com/openai/v1/chat/completions',
      apiKey: GROQ_API_KEY,
      model: DEFAULT_GROQ_MODEL,
      body: { model: DEFAULT_GROQ_MODEL, max_tokens: 400, messages: [
        { role: 'system', content: systemPrompt + userPart },
        ...messages,
      ] },
    });
  }

  if (MISTRAL_API_KEY) {
    providers.push({
      name: 'Mistral',
      endpoint: 'https://api.mistral.ai/v1/chat/completions',
      apiKey: MISTRAL_API_KEY,
      model: 'mistral-small-latest',
      body: {
        model: 'mistral-small-latest',
        max_tokens: 400,
        messages: [
          { role: 'system', content: systemPrompt + userPart },
          ...messages,
        ],
      },
    });
  }

  let lastError = null;

  for (const provider of providers) {
    try {
      const response = await fetch(provider.endpoint, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${provider.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(provider.body),
        signal: AbortSignal.timeout(30000),
      });

      if (response.ok) {
        const data = await response.json();
        const rawReply = data.choices?.[0]?.message?.content || '';
        const result = parseStructuredReply(rawReply);

        persistConversation(supabaseAdmin, chatUser?.id, null, mode, message, result);

        return res.json({
          reply: result.reply,
          should_escalate: result.should_escalate,
          suggested_priority: result.suggested_priority,
        });
      }

      const errBody = await response.text().catch(() => '');
      lastError = `${provider.name} API error: ${response.status} ${errBody.slice(0, 200)}`;
      console.error('[ai-chat]', lastError);
    } catch (err) {
      lastError = `${provider.name} request failed: ${err.message}`;
      console.error('[ai-chat]', lastError);
    }
  }

  if (lastError) {
    console.warn('[ai-chat] All configured LLM providers failed. Falling back to local support response.', lastError);
  }

  // 6. Honest fallback when no API key or API failure
  let fallbackReply = "I'm having trouble connecting to my knowledge base right now. ";
  if (isSupportChat) {
    fallbackReply += "A human agent will be with you shortly. In the meantime, you can check our FAQ or create a support ticket for faster assistance.";
  } else {
    fallbackReply += "Please try again in a moment, or create a support ticket if you need immediate help.";
  }

  persistConversation(supabaseAdmin, chatUser?.id, null, mode, message, {
    reply: fallbackReply,
    confidence: 0.1,
    should_escalate: true,
    suggested_priority: 'normal',
  });

  return res.json({
    reply: fallbackReply,
    should_escalate: true,
    suggested_priority: 'normal',
  });
}

module.exports = { handleAIChatRAG };
