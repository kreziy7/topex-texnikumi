import { Helmet } from 'react-helmet-async';

const SITE_NAME = 'TOPEX Texnikumi';
const DEFAULT_OG_IMAGE = 'https://topextexnikum.uz/assets/images/hero/hero-2.webp';
const OG_IMAGE_W = 1200;
const OG_IMAGE_H = 630;

const SeoHelmet = ({
  title,
  description,
  keywords,
  canonical,
  ogImage,
  ogType = 'website',
  noindex = false,
  children,
}) => {
  const img = ogImage || DEFAULT_OG_IMAGE;
  return (
    <Helmet>
      <title>{title}</title>
      {description && <meta name="description" content={description} />}
      {keywords && <meta name="keywords" content={keywords} />}
      {canonical && <link rel="canonical" href={canonical} />}
      {noindex && <meta name="robots" content="noindex, nofollow" />}

      <meta property="og:type" content={ogType} />
      <meta property="og:site_name" content={SITE_NAME} />
      <meta property="og:locale" content="uz_UZ" />
      {title && <meta property="og:title" content={title} />}
      {description && <meta property="og:description" content={description} />}
      {canonical && <meta property="og:url" content={canonical} />}
      <meta property="og:image" content={img} />
      <meta property="og:image:width" content={String(OG_IMAGE_W)} />
      <meta property="og:image:height" content={String(OG_IMAGE_H)} />

      <meta name="twitter:card" content="summary_large_image" />
      {title && <meta name="twitter:title" content={title} />}
      {description && <meta name="twitter:description" content={description} />}
      <meta name="twitter:image" content={img} />

      {/* Языки переключаются через localStorage (i18next), отдельных URL нет —
          hreflang на несуществующие /ru, /en страницы НЕ генерируем, это дубли для Google */}
      <link rel="alternate" hreflang="x-default" href={canonical || 'https://topextexnikum.uz/'} />
      <link rel="alternate" hreflang="uz" href={canonical || 'https://topextexnikum.uz/'} />

      {children}
    </Helmet>
  );
};

export default SeoHelmet;
