import { Link } from 'react-router-dom';
import { ArrowRight, Clock, Calendar } from 'lucide-react';
import SEO from '../components/SEO';
import PRQFooter from '../components/PRQFooter';
import { BLOG_POSTS } from '../blogPosts';

const C = {
  forest: '#1B4332', green: '#2D6A4F', mint: '#40916C', sage: '#52B788',
  gold: '#F4A422', mist: '#F0FAF5',
  g50: '#F8FAFC', g100: '#F1F5F9', g200: '#E2E8F0',
  g500: '#64748B', g600: '#475569', g700: '#334155', g800: '#1E293B',
};

function formatDate(iso) {
  try {
    return new Date(iso).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  } catch {
    return iso;
  }
}

function PostCard({ post }) {
  return (
    <Link
      to={`/blog/${post.slug}`}
      className="group flex flex-col rounded-2xl overflow-hidden transition hover:-translate-y-1"
      style={{ background: '#fff', border: `1px solid ${C.g200}`, boxShadow: '0 2px 12px rgba(0,0,0,0.04)' }}
    >
      <div className="p-6 flex flex-col flex-1">
        <span
          className="inline-block self-start px-2.5 py-1 rounded-full text-[11px] font-black uppercase tracking-wide mb-3"
          style={{ background: C.mist, color: C.green }}
        >
          {post.category}
        </span>
        <h2 className="text-lg font-black leading-snug mb-2 group-hover:underline" style={{ color: C.g800 }}>
          {post.title}
        </h2>
        <p className="text-sm leading-relaxed mb-4 flex-1" style={{ color: C.g600 }}>
          {post.excerpt}
        </p>
        <div className="flex items-center justify-between text-xs font-semibold" style={{ color: C.g500 }}>
          <span className="flex items-center gap-1.5">
            <Calendar size={13} /> {formatDate(post.publishDate)}
          </span>
          <span className="flex items-center gap-1.5">
            <Clock size={13} /> {post.readTime}
          </span>
        </div>
        <span
          className="mt-4 inline-flex items-center gap-1.5 text-sm font-black"
          style={{ color: C.green }}
        >
          Read article <ArrowRight size={15} className="transition group-hover:translate-x-1" />
        </span>
      </div>
    </Link>
  );
}

export default function Blog() {
  return (
    <div className="min-h-screen flex flex-col" style={{ backgroundColor: C.g100, fontFamily: "'DM Sans',sans-serif" }}>
      <SEO
        title="Bitcoin & USDT Trading Guides for Africa & Worldwide | PRAQEN Blog"
        description="Learn how to buy and sell Bitcoin & USDT with Mobile Money, M-Pesa and bank transfer. Guides for Ghana, Nigeria, and P2P traders across Africa and worldwide."
        image="https://praqen.com/og-image-v2.png"
      />

      <div style={{ backgroundColor: C.forest }} className="w-full">
        <div className="max-w-5xl mx-auto px-4 py-14 sm:py-20 text-center">
          <p className="text-xs font-black uppercase tracking-widest mb-3" style={{ color: C.gold }}>
            PRAQEN Blog
          </p>
          <h1 className="text-3xl sm:text-5xl font-black text-white leading-tight mb-4">
            Bitcoin &amp; USDT Trading Guides
          </h1>
          <p className="text-sm sm:text-base max-w-2xl mx-auto" style={{ color: 'rgba(255,255,255,0.65)' }}>
            Practical, no-nonsense guides on buying and selling Bitcoin &amp; USDT with Mobile Money,
            M-Pesa and bank transfer — built for traders in Ghana, Nigeria, across Africa, and worldwide.
          </p>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 py-10 sm:py-14 flex-1 w-full">
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {BLOG_POSTS.map(post => (
            <PostCard key={post.slug} post={post} />
          ))}
        </div>
      </div>

      <PRQFooter />
    </div>
  );
}
