import { Helmet } from 'react-helmet-async';
import { useLocation } from 'react-router-dom';
import { PAGE_META, NOINDEX_PAGES } from '../seoMeta';

const SITE = 'https://praqen.com';

export default function SEO({ title, description, noindex, image, ogType, publishedTime }) {
  const { pathname, search } = useLocation();

  const hasQueryParams = search.length > 1;
  const isPrivatePage  = NOINDEX_PAGES.some(p => pathname.startsWith(p));
  const shouldNoIndex  = noindex === true || hasQueryParams || isPrivatePage;

  const meta     = PAGE_META[pathname] || {};
  const pageTitle = title       || meta.title       || 'PRAQEN | Buy & Sell Bitcoin & USDT P2P Worldwide';
  const pageDesc  = description || meta.description || "The world's most trusted P2P Bitcoin & USDT trading platform. Buy or sell Bitcoin & USDT with Mobile Money.";
  const ogTitle   = meta.ogTitle  || pageTitle;
  const ogDesc    = meta.ogDesc   || pageDesc;

  // Canonical always points to the clean path — no query params
  const canonical = `${SITE}${pathname === '/' ? '' : pathname}`;

  const robotsContent = shouldNoIndex
    ? 'noindex, follow'
    : 'index, follow, max-snippet:-1, max-image-preview:large, max-video-preview:-1';

  return (
    <Helmet>
      <title>{pageTitle}</title>
      <meta name="description" content={pageDesc} />
      <meta name="robots" content={robotsContent} />
      <meta name="googlebot" content={robotsContent} />
      <link rel="canonical" href={canonical} />
      <meta property="og:title"       content={ogTitle} />
      <meta property="og:description" content={ogDesc} />
      <meta property="og:url"         content={canonical} />
      <meta property="og:type"        content={ogType || 'website'} />
      <meta property="og:site_name"   content="PRAQEN" />
      <meta property="og:image"       content={image || 'https://praqen.com/og-image-v2.png'} />
      {publishedTime && <meta property="article:published_time" content={publishedTime} />}
      <meta name="twitter:title"       content={ogTitle} />
      <meta name="twitter:description" content={ogDesc} />
      <meta name="twitter:image"       content={image || 'https://praqen.com/og-image-v2.png'} />
    </Helmet>
  );
}
