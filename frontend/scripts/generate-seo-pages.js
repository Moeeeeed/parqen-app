// Postbuild step: this is a plain create-react-app SPA, so every route serves the
// exact same static index.html (title/meta/JSON-LD only update after React mounts
// and react-helmet-async runs). Crawlers that don't execute JS — and even Google's
// first crawl pass — see byte-identical content on every URL, which is why only "/"
// was getting indexed. This script clones the already-built index.html (so the
// hashed JS/CSS bundle references stay correct) once per public route, swapping in
// route-specific title/meta/OG/canonical/JSON-LD/H1/intro text. React still mounts
// normally and takes over client-side routing — this only affects the first byte a
// crawler (or a user hitting the URL directly) sees before JS runs.

const fs = require('fs');
const path = require('path');
const { PAGE_META } = require('../src/seoMeta');
const { BLOG_POSTS } = require('../src/blogPosts');

const SITE = 'https://praqen.com';
const BUILD_DIR = path.join(__dirname, '..', 'build');
const INDEX_PATH = path.join(BUILD_DIR, 'index.html');

const BLOG_INDEX_META = {
  title: 'Bitcoin & USDT Trading Guides for Africa & Worldwide | PRAQEN Blog',
  description: 'Learn how to buy and sell Bitcoin & USDT with Mobile Money, M-Pesa and bank transfer. Guides for Ghana, Nigeria, and P2P traders across Africa and worldwide.',
  ogTitle: 'PRAQEN Blog — Bitcoin & USDT Trading Guides',
  ogDesc: 'Practical guides on buying and selling Bitcoin & USDT with Mobile Money, M-Pesa and bank transfer.',
  h1: 'Bitcoin & USDT Trading Guides',
  intro: "Practical, no-nonsense guides on buying and selling Bitcoin & USDT with Mobile Money, M-Pesa and bank transfer — built for traders in Ghana, Nigeria, across Africa, and worldwide.",
};

function escapeHtml(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function escapeJson(str) {
  return str.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

// ── Convert one blogPosts.js content block into plain semantic HTML ─────────
// Mirrors the block types rendered by src/pages/BlogPost.js — kept in sync by hand.
function blockToHtml(block) {
  switch (block.type) {
    case 'p':
      return `<p>${escapeHtml(block.text)}</p>`;
    case 'h2':
      return `<h2>${escapeHtml(block.text)}</h2>`;
    case 'h3':
      return `<h3>${escapeHtml(block.text)}</h3>`;
    case 'ul':
      return `<ul>${block.items.map(i =>
        `<li>${i.label ? `<strong>${escapeHtml(i.label)}:</strong> ` : ''}${escapeHtml(i.text)}</li>`
      ).join('')}</ul>`;
    case 'ol':
      return `<ol>${block.items.map(i => `<li>${escapeHtml(i)}</li>`).join('')}</ol>`;
    case 'steps':
      return `<ol>${block.items.map(s =>
        `<li><strong>${escapeHtml(s.title)}</strong> — ${escapeHtml(s.body)}</li>`
      ).join('')}</ol>`;
    case 'highlights':
      return `<ul>${block.items.map(h =>
        `<li><strong>${escapeHtml(h.label)}:</strong> ${escapeHtml(h.text)}</li>`
      ).join('')}</ul>`;
    case 'faq':
      return `<h2>Frequently Asked Questions</h2>` + block.items.map(f =>
        `<h3>${escapeHtml(f.q)}</h3><p>${escapeHtml(f.a)}</p>`
      ).join('');
    case 'cta':
      return `<p><a href="${block.to}">${escapeHtml(block.label)}</a></p>`;
    default:
      return '';
  }
}

function articleBodyHtml(post) {
  return `<h1>${escapeHtml(post.title)}</h1>` +
    `<p>${escapeHtml(post.excerpt)}</p>` +
    post.content.map(blockToHtml).join('') +
    `<nav aria-label="Quick links"><a href="/register">Create Account</a> <a href="/buy-bitcoin">Buy Bitcoin</a> <a href="/sell-bitcoin">Sell Bitcoin</a></nav>`;
}

function blogIndexBodyHtml() {
  const items = BLOG_POSTS.map(p =>
    `<li><a href="/blog/${p.slug}">${escapeHtml(p.title)}</a> — ${escapeHtml(p.excerpt)}</li>`
  ).join('');
  return `<h1>${escapeHtml(BLOG_INDEX_META.h1)}</h1><p>${escapeHtml(BLOG_INDEX_META.intro)}</p><ul>${items}</ul>`;
}

function articleJsonLd(post) {
  const canonical = `${SITE}/blog/${post.slug}`;
  const faqBlock = post.content.find(b => b.type === 'faq');
  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'BlogPosting',
        '@id': `${canonical}#article`,
        headline: post.title,
        description: post.metaDescription,
        image: 'https://praqen.com/og-image-v2.png',
        datePublished: post.publishDate,
        dateModified: post.publishDate,
        author: { '@type': 'Organization', name: 'PRAQEN', url: SITE },
        publisher: { '@type': 'Organization', name: 'PRAQEN', logo: { '@type': 'ImageObject', url: `${SITE}/logo192.png` } },
        mainEntityOfPage: { '@type': 'WebPage', '@id': canonical },
      },
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Home', item: SITE },
          { '@type': 'ListItem', position: 2, name: 'Blog', item: `${SITE}/blog` },
          { '@type': 'ListItem', position: 3, name: post.title, item: canonical },
        ],
      },
      ...(faqBlock ? [{
        '@type': 'FAQPage',
        mainEntity: faqBlock.items.map(f => ({
          '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.a },
        })),
      }] : []),
    ],
  };
}

function buildPage(template, route, meta, opts = {}) {
  const canonical = `${SITE}${route === '/' ? '' : route}`;
  let html = template;

  // Self-closing void elements (meta/link) come out of the production build as
  // e.g. `content="..."/>` with no space before the slash — match either way.
  html = html.replace(/<title>[^<]*<\/title>/, `<title>${escapeHtml(meta.title)}</title>`);
  html = html.replace(
    /<meta name="description" content="[^"]*"\s*\/>/,
    `<meta name="description" content="${meta.description.replace(/"/g, '&quot;')}"/>`
  );
  html = html.replace(
    /<link rel="canonical" href="[^"]*"\s*\/>/,
    `<link rel="canonical" href="${canonical}"/>`
  );
  html = html.replace(
    /<meta property="og:url" content="[^"]*"\s*\/>/,
    `<meta property="og:url" content="${canonical}"/>`
  );
  html = html.replace(
    /<meta property="og:title" content="[^"]*"\s*\/>/,
    `<meta property="og:title" content="${meta.ogTitle.replace(/"/g, '&quot;')}"/>`
  );
  html = html.replace(
    /<meta property="og:description" content="[^"]*"\s*\/>/,
    `<meta property="og:description" content="${meta.ogDesc.replace(/"/g, '&quot;')}"/>`
  );
  html = html.replace(
    /<meta name="twitter:title" content="[^"]*"\s*\/>/,
    `<meta name="twitter:title" content="${meta.ogTitle.replace(/"/g, '&quot;')}"/>`
  );
  html = html.replace(
    /<meta name="twitter:description" content="[^"]*"\s*\/>/,
    `<meta name="twitter:description" content="${meta.ogDesc.replace(/"/g, '&quot;')}"/>`
  );
  if (opts.ogType) {
    html = html.replace(
      /<meta property="og:type" content="[^"]*"\s*\/>/,
      `<meta property="og:type" content="${opts.ogType}"/>`
    );
  }

  // JSON-LD WebPage node — replace the whole node body in one shot so this
  // page's structured data describes itself, not the homepage.
  html = html.replace(
    /"@type":\s*"WebPage",\s*"@id":\s*"[^"]*",\s*"url":\s*"[^"]*",\s*"name":\s*"[^"]*",\s*"isPartOf":\s*\{[^}]*\},\s*"about":\s*\{[^}]*\},\s*"description":\s*"[^"]*"/,
    `"@type": "WebPage",\n          "@id": "${canonical}#webpage",\n          "url": "${canonical}",\n          "name": "${escapeJson(meta.title)}",\n          "isPartOf": { "@id": "${SITE}/#website" },\n          "about": { "@id": "${SITE}/#organization" },\n          "description": "${escapeJson(meta.description)}"`
  );

  // Extra per-page JSON-LD (e.g. BlogPosting/FAQPage) — inserted right before </head>.
  if (opts.jsonLd) {
    html = html.replace(
      '</head>',
      `<script type="application/ld+json">${JSON.stringify(opts.jsonLd)}</script></head>`
    );
  }

  if (opts.bodyHtml) {
    // Full custom body (used for blog routes, which have real long-form content
    // rather than a one-paragraph intro) — replace the entire seo-body inner HTML.
    html = html.replace(
      /(<div id="praqen-seo-body"[^>]*>)[\s\S]*?(<\/div>)/,
      `$1${opts.bodyHtml}$2`
    );
    html = html.replace(
      /(<noscript>[\s\S]*?)<h1>[^<]*<\/h1>\s*<p>[^<]*<\/p>([\s\S]*?<\/noscript>)/,
      `$1<h1>${escapeHtml(meta.h1)}</h1><p>${escapeHtml(meta.intro)}</p>$2`
    );
  } else {
    // Hidden crawler-readable body + noscript fallback — swap the H1 and intro
    // paragraph so each route has genuinely unique first-paragraph content.
    html = html.replace(
      /(<h1>)[^<]*(<\/h1>)/g,
      `$1${escapeHtml(meta.h1)}$2`
    );
    html = html.replace(
      /(<div id="praqen-seo-body"[^>]*>\s*<h1>[^<]*<\/h1>\s*<p>)[^<]*(<\/p>)/,
      `$1${escapeHtml(meta.intro)}$2`
    );
    html = html.replace(
      /(<noscript>[\s\S]*?<h1>[^<]*<\/h1>\s*<p>)[^<]*(<\/p>)/,
      `$1${escapeHtml(meta.intro)}$2`
    );
  }

  return html;
}

function main() {
  if (!fs.existsSync(INDEX_PATH)) {
    console.error('[generate-seo-pages] build/index.html not found — run `react-scripts build` first.');
    process.exit(1);
  }
  const template = fs.readFileSync(INDEX_PATH, 'utf8');

  Object.entries(PAGE_META).forEach(([route, meta]) => {
    if (route === '/') return; // homepage index.html is already correct as-is
    const html = buildPage(template, route, meta);
    const outDir = path.join(BUILD_DIR, route.replace(/^\//, ''));
    fs.mkdirSync(outDir, { recursive: true });
    fs.writeFileSync(path.join(outDir, 'index.html'), html);
    console.log(`[generate-seo-pages] wrote ${path.relative(BUILD_DIR, outDir)}/index.html`);
  });

  // ── Blog index (/blog) ──────────────────────────────────────────────────
  {
    const html = buildPage(template, '/blog', BLOG_INDEX_META, { bodyHtml: blogIndexBodyHtml() });
    const outDir = path.join(BUILD_DIR, 'blog');
    fs.mkdirSync(outDir, { recursive: true });
    fs.writeFileSync(path.join(outDir, 'index.html'), html);
    console.log('[generate-seo-pages] wrote blog/index.html');
  }

  // ── Blog articles (/blog/:slug) — one automatically per BLOG_POSTS entry ──
  BLOG_POSTS.forEach(post => {
    const meta = {
      title: post.metaTitle,
      description: post.metaDescription,
      ogTitle: post.ogTitle,
      ogDesc: post.ogDesc,
      h1: post.title,
      intro: post.excerpt,
    };
    const html = buildPage(template, `/blog/${post.slug}`, meta, {
      ogType: 'article',
      bodyHtml: articleBodyHtml(post),
      jsonLd: articleJsonLd(post),
    });
    const outDir = path.join(BUILD_DIR, 'blog', post.slug);
    fs.mkdirSync(outDir, { recursive: true });
    fs.writeFileSync(path.join(outDir, 'index.html'), html);
    console.log(`[generate-seo-pages] wrote blog/${post.slug}/index.html`);
  });
}

main();
