import { Helmet } from 'react-helmet-async';
import { Link, useParams, Navigate } from 'react-router-dom';
import { ArrowRight, ArrowLeft, Clock, Calendar } from 'lucide-react';
import SEO from '../components/SEO';
import PRQFooter from '../components/PRQFooter';
import { BLOG_POSTS } from '../blogPosts';

const SITE = 'https://praqen.com';

const C = {
  forest: '#1B4332', green: '#2D6A4F', mint: '#40916C',
  gold: '#F4A422', mist: '#F0FAF5',
  g100: '#F1F5F9', g200: '#E2E8F0',
  g500: '#64748B', g600: '#475569', g700: '#334155', g800: '#1E293B',
};

function formatDate(iso) {
  try {
    return new Date(iso).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  } catch {
    return iso;
  }
}

const MD_LINK_RE = /\[([^\]]+)\]\((\/[^)]+)\)/g;

function inlineLinks(text, links) {
  // Two link mechanisms, both supported: (1) markdown-style [label](/path) written
  // directly in the content string — parsed here so it never shows up as raw
  // bracket/paren text; (2) an explicit `links: [{ label, to }]` array on the block,
  // which swaps every occurrence of `label` in the text for a <Link>.
  if (typeof text !== 'string') return text;

  let parts = [];
  let lastIndex = 0;
  let match;
  MD_LINK_RE.lastIndex = 0;
  while ((match = MD_LINK_RE.exec(text))) {
    if (match.index > lastIndex) parts.push(text.slice(lastIndex, match.index));
    parts.push(
      <Link key={`md-${match.index}`} to={match[2]} className="font-bold underline" style={{ color: C.green }}>
        {match[1]}
      </Link>
    );
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < text.length) parts.push(text.slice(lastIndex));
  if (parts.length === 0) parts = [text];

  if (links && links.length) {
    links.forEach(({ label, to }) => {
      parts = parts.flatMap(part => {
        if (typeof part !== 'string' || !part.includes(label)) return [part];
        const segs = part.split(label);
        const out = [];
        segs.forEach((seg, i) => {
          out.push(seg);
          if (i < segs.length - 1) {
            out.push(
              <Link key={`${label}-${i}`} to={to} className="font-bold underline" style={{ color: C.green }}>
                {label}
              </Link>
            );
          }
        });
        return out;
      });
    });
  }
  return parts;
}

function Block({ block }) {
  switch (block.type) {
    case 'p':
      return (
        <p className="text-[15px] leading-7 mb-4" style={{ color: C.g700 }}>
          {inlineLinks(block.text, block.links)}
        </p>
      );
    case 'h2':
      return (
        <h2 className="text-xl sm:text-2xl font-black mt-10 mb-3" style={{ color: C.g800 }}>
          {block.text}
        </h2>
      );
    case 'h3':
      return (
        <h3 className="text-lg font-black mt-6 mb-2" style={{ color: C.g800 }}>
          {block.text}
        </h3>
      );
    case 'ul':
      return (
        <ul className="mb-5 space-y-2">
          {block.items.map((item, i) => (
            <li key={i} className="text-[15px] leading-7 pl-5 relative" style={{ color: C.g700 }}>
              <span className="absolute left-0" style={{ color: C.mint }}>•</span>
              {item.label ? <strong style={{ color: C.g800 }}>{item.label}: </strong> : null}
              {item.text}
            </li>
          ))}
        </ul>
      );
    case 'ol':
      return (
        <ol className="mb-5 space-y-2 list-decimal list-inside">
          {block.items.map((item, i) => (
            <li key={i} className="text-[15px] leading-7" style={{ color: C.g700 }}>
              {item}
            </li>
          ))}
        </ol>
      );
    case 'steps':
      return (
        <div className="grid sm:grid-cols-2 gap-4 mb-6">
          {block.items.map((step, i) => (
            <div key={i} className="rounded-xl p-5" style={{ background: '#fff', border: `1px solid ${C.g200}` }}>
              <div
                className="w-7 h-7 rounded-lg flex items-center justify-center text-xs font-black text-white mb-3"
                style={{ background: C.green }}
              >
                {i + 1}
              </div>
              <h3 className="text-[15px] font-black mb-1.5" style={{ color: C.g800 }}>{step.title}</h3>
              <p className="text-sm leading-6 mb-3" style={{ color: C.g600 }}>{step.body}</p>
              <div className="flex flex-wrap gap-2">
                {step.cta && (
                  <Link to={step.cta.to} className="inline-flex items-center gap-1 text-sm font-black" style={{ color: C.green }}>
                    {step.cta.label} <ArrowRight size={14} />
                  </Link>
                )}
                {step.cta2 && (
                  <Link to={step.cta2.to} className="inline-flex items-center gap-1 text-sm font-black" style={{ color: C.green }}>
                    {step.cta2.label} <ArrowRight size={14} />
                  </Link>
                )}
              </div>
            </div>
          ))}
        </div>
      );
    case 'highlights':
      return (
        <div className="grid sm:grid-cols-2 gap-3 mb-6">
          {block.items.map((h, i) => (
            <div key={i} className="flex items-start gap-3 rounded-xl p-4" style={{ background: C.mist }}>
              <span className="text-xl leading-none">{h.emoji}</span>
              <div>
                <p className="text-sm font-black" style={{ color: C.g800 }}>{h.label}</p>
                <p className="text-sm" style={{ color: C.g600 }}>{h.text}</p>
              </div>
            </div>
          ))}
        </div>
      );
    case 'faq':
      return (
        <div className="mb-6">
          <h2 className="text-xl sm:text-2xl font-black mt-10 mb-3" style={{ color: C.g800 }}>
            Frequently Asked Questions
          </h2>
          <div className="space-y-3">
            {block.items.map((f, i) => (
              <div key={i} className="rounded-xl p-5" style={{ background: '#fff', border: `1px solid ${C.g200}` }}>
                <h3 className="text-[15px] font-black mb-1.5" style={{ color: C.g800 }}>{f.q}</h3>
                <p className="text-sm leading-6" style={{ color: C.g600 }}>
                  {inlineLinks(f.a, f.cta ? [{ label: f.cta.label, to: f.cta.to }] : null)}
                </p>
              </div>
            ))}
          </div>
        </div>
      );
    case 'cta':
      return (
        <div className="rounded-2xl p-8 text-center mt-10" style={{ background: C.forest }}>
          <p className="text-lg sm:text-xl font-black text-white mb-2">{block.heading}</p>
          <p className="text-sm mb-5" style={{ color: 'rgba(255,255,255,0.7)' }}>{block.text}</p>
          <Link
            to={block.to}
            className="inline-flex items-center gap-2 px-6 py-3 rounded-xl font-black text-sm"
            style={{ background: C.gold, color: C.forest }}
          >
            {block.label} <ArrowRight size={16} />
          </Link>
        </div>
      );
    default:
      return null;
  }
}

export default function BlogPost() {
  const { slug } = useParams();
  const post = BLOG_POSTS.find(p => p.slug === slug);

  if (!post) return <Navigate to="/blog" replace />;

  const canonical = `${SITE}/blog/${post.slug}`;

  const articleJsonLd = {
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
        publisher: {
          '@type': 'Organization',
          name: 'PRAQEN',
          logo: { '@type': 'ImageObject', url: `${SITE}/logo192.png` },
        },
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
      ...(post.content.some(b => b.type === 'faq')
        ? [{
            '@type': 'FAQPage',
            mainEntity: post.content
              .filter(b => b.type === 'faq')
              .flatMap(b => b.items)
              .map(f => ({
                '@type': 'Question',
                name: f.q,
                acceptedAnswer: { '@type': 'Answer', text: f.a },
              })),
          }]
        : []),
    ],
  };

  return (
    <div className="min-h-screen flex flex-col" style={{ backgroundColor: C.g100, fontFamily: "'DM Sans',sans-serif" }}>
      <SEO
        title={post.metaTitle}
        description={post.metaDescription}
        ogType="article"
        publishedTime={post.publishDate}
      />
      <Helmet>
        <script type="application/ld+json">{JSON.stringify(articleJsonLd)}</script>
      </Helmet>

      <div style={{ backgroundColor: C.forest }} className="w-full">
        <div className="max-w-3xl mx-auto px-4 py-10 sm:py-16">
          <Link to="/blog" className="inline-flex items-center gap-1.5 text-xs font-bold mb-5" style={{ color: 'rgba(255,255,255,0.6)' }}>
            <ArrowLeft size={14} /> Back to Blog
          </Link>
          <span
            className="inline-block px-2.5 py-1 rounded-full text-[11px] font-black uppercase tracking-wide mb-4"
            style={{ background: 'rgba(244,164,34,0.15)', color: C.gold }}
          >
            {post.category}
          </span>
          <h1 className="text-2xl sm:text-4xl font-black text-white leading-tight mb-4">
            {post.title}
          </h1>
          <div className="flex items-center gap-4 text-xs font-semibold" style={{ color: 'rgba(255,255,255,0.55)' }}>
            <span className="flex items-center gap-1.5"><Calendar size={13} /> {formatDate(post.publishDate)}</span>
            <span className="flex items-center gap-1.5"><Clock size={13} /> {post.readTime}</span>
          </div>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-4 py-10 flex-1 w-full">
        <article>
          {post.content.map((block, i) => <Block key={i} block={block} />)}
        </article>

        <div className="flex flex-wrap gap-2 mt-10">
          {post.tags.map(tag => (
            <span key={tag} className="px-3 py-1 rounded-full text-xs font-bold" style={{ background: C.g200, color: C.g600 }}>
              #{tag.replace(/\s+/g, '')}
            </span>
          ))}
        </div>
      </div>

      <PRQFooter />
    </div>
  );
}
