// Postbuild step: regenerates build/sitemap.xml from the same PAGE_META and
// BLOG_POSTS data used by generate-seo-pages.js, so every published blog post
// (or any new PAGE_META route) is automatically included on the next build —
// nobody has to remember to hand-edit sitemap.xml again.

const fs = require('fs');
const path = require('path');
const { PAGE_META } = require('../src/seoMeta');
const { BLOG_POSTS } = require('../src/blogPosts');

const SITE = 'https://praqen.com';
const BUILD_DIR = path.join(__dirname, '..', 'build');
const OUT_PATH = path.join(BUILD_DIR, 'sitemap.xml');

const STATIC_URLS = [
  { loc: '/',                changefreq: 'daily',   priority: '1.0' },
  { loc: '/buy-bitcoin',     changefreq: 'hourly',  priority: '0.9' },
  { loc: '/sell-bitcoin',    changefreq: 'hourly',  priority: '0.9' },
  { loc: '/gift-cards',      changefreq: 'daily',   priority: '0.9' },
  { loc: '/sell-gift-card',  changefreq: 'daily',   priority: '0.8' },
  { loc: '/register',        changefreq: 'monthly', priority: '0.8' },
  { loc: '/login',           changefreq: 'monthly', priority: '0.7' },
  { loc: '/blog',            changefreq: 'weekly',  priority: '0.8' },
  { loc: '/privacy',         changefreq: 'yearly',  priority: '0.3' },
  { loc: '/terms',           changefreq: 'yearly',  priority: '0.3' },
];

function today() {
  return new Date().toISOString().slice(0, 10);
}

function main() {
  const urls = [...STATIC_URLS];

  // Any other public PAGE_META route not already listed above.
  Object.keys(PAGE_META).forEach(route => {
    if (!urls.some(u => u.loc === route)) {
      urls.push({ loc: route, changefreq: 'monthly', priority: '0.7' });
    }
  });

  BLOG_POSTS.forEach(post => {
    urls.push({
      loc: `/blog/${post.slug}`,
      changefreq: 'monthly',
      priority: '0.7',
      lastmod: post.publishDate,
    });
  });

  const lastmod = today();
  const body = urls.map(u => `    <url>
        <loc>${SITE}${u.loc === '/' ? '/' : u.loc+'/'}</loc>
        <lastmod>${u.lastmod || lastmod}</lastmod>
        <changefreq>${u.changefreq}</changefreq>
        <priority>${u.priority}</priority>
    </url>`).join('\n');

  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${body}\n</urlset>\n`;

  fs.mkdirSync(BUILD_DIR, { recursive: true });
  fs.writeFileSync(OUT_PATH, xml);
  console.log(`[generate-sitemap] wrote ${urls.length} URLs to build/sitemap.xml`);
}

main();
