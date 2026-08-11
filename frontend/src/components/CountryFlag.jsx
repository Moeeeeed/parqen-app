import { useState, useEffect } from 'react';

// ISO 3166-1 alpha-3 → alpha-2
const ALPHA3_TO_2 = {
  GHA:'gh',NGA:'ng',KEN:'ke',TZA:'tz',UGA:'ug',RWA:'rw',CIV:'ci',CMR:'cm',
  SEN:'sn',MLI:'ml',BFA:'bf',BEN:'bj',TGO:'tg',NER:'ne',COD:'cd',COG:'cg',
  ZMB:'zm',ZWE:'zw',MOZ:'mz',ZAF:'za',ETH:'et',EGY:'eg',MAR:'ma',DZA:'dz',
  TUN:'tn',SDN:'sd',AGO:'ao',MWI:'mw',NAM:'na',BWA:'bw',LBR:'lr',SLE:'sl',
  GIN:'gn',USA:'us',GBR:'gb',DEU:'de',FRA:'fr',ITA:'it',ESP:'es',NLD:'nl',
  BEL:'be',CHE:'ch',SWE:'se',NOR:'no',DNK:'dk',FIN:'fi',POL:'pl',UKR:'ua',
  TUR:'tr',IND:'in',CHN:'cn',JPN:'jp',KOR:'kr',SGP:'sg',MYS:'my',IDN:'id',
  PHL:'ph',VNM:'vn',THA:'th',PAK:'pk',BGD:'bd',SAU:'sa',ARE:'ae',QAT:'qa',
  BRA:'br',MEX:'mx',COL:'co',ARG:'ar',CAN:'ca',AUS:'au',NZL:'nz',VEN:'ve',
  RUS:'ru',
};

// Map common country names/variants → ISO 3166-1 alpha-2 codes
const NAME_TO_CODE = {
  // Africa
  'ghana':'gh','nigeria':'ng','kenya':'ke','tanzania':'tz','uganda':'ug',
  'rwanda':'rw',"côte d'ivoire":'ci',"cote d'ivoire":'ci','ivory coast':'ci',
  'cameroon':'cm','senegal':'sn','mali':'ml','burkina faso':'bf','benin':'bj',
  'togo':'tg','niger':'ne','dr congo':'cd','democratic republic of congo':'cd',
  'democratic republic of the congo':'cd','congo':'cg','republic of congo':'cg',
  'zambia':'zm','zimbabwe':'zw','mozambique':'mz','south africa':'za',
  'ethiopia':'et','egypt':'eg','morocco':'ma','algeria':'dz','tunisia':'tn',
  'sudan':'sd','angola':'ao','malawi':'mw','namibia':'na','botswana':'bw',
  'liberia':'lr','sierra leone':'sl','guinea':'gn','gambia':'gm',
  'guinea-bissau':'gw','cape verde':'cv','sao tome and principe':'st',
  'equatorial guinea':'gq','gabon':'ga','central african republic':'cf',
  'chad':'td','somalia':'so','djibouti':'dj','eritrea':'er','burundi':'bi',
  'comoros':'km','madagascar':'mg','mauritius':'mu','seychelles':'sc',
  'lesotho':'ls','eswatini':'sz','swaziland':'sz',
  // Europe
  'united kingdom':'gb','uk':'gb','great britain':'gb','england':'gb',
  'united states':'us','usa':'us','america':'us','united states of america':'us',
  'germany':'de','france':'fr','italy':'it','spain':'es','netherlands':'nl',
  'holland':'nl','belgium':'be','switzerland':'ch','sweden':'se','norway':'no',
  'denmark':'dk','finland':'fi','poland':'pl','ukraine':'ua','turkey':'tr',
  'russia':'ru','portugal':'pt','austria':'at','czech republic':'cz',
  'czechia':'cz','hungary':'hu','romania':'ro','bulgaria':'bg','greece':'gr',
  'croatia':'hr','serbia':'rs','slovakia':'sk','slovenia':'si','latvia':'lv',
  'lithuania':'lt','estonia':'ee','ireland':'ie','scotland':'gb','wales':'gb',
  // Asia
  'india':'in','china':'cn','japan':'jp','south korea':'kr','korea':'kr',
  'singapore':'sg','malaysia':'my','indonesia':'id','philippines':'ph',
  'vietnam':'vn','thailand':'th','pakistan':'pk','bangladesh':'bd',
  'sri lanka':'lk','myanmar':'mm','cambodia':'kh','laos':'la','nepal':'np',
  'hong kong':'hk','taiwan':'tw','mongolia':'mn','afghanistan':'af',
  // Middle East
  'saudi arabia':'sa','uae':'ae','united arab emirates':'ae','qatar':'qa',
  'kuwait':'kw','bahrain':'bh','oman':'om','jordan':'jo','israel':'il',
  'lebanon':'lb','iraq':'iq','iran':'ir','yemen':'ye','syria':'sy',
  // Americas
  'brazil':'br','mexico':'mx','colombia':'co','argentina':'ar','venezuela':'ve',
  'peru':'pe','chile':'cl','ecuador':'ec','bolivia':'bo','paraguay':'py',
  'uruguay':'uy','cuba':'cu','haiti':'ht','dominican republic':'do',
  'guatemala':'gt','honduras':'hn','el salvador':'sv','nicaragua':'ni',
  'costa rica':'cr','panama':'pa','jamaica':'jm','trinidad and tobago':'tt',
  // Oceania
  'canada':'ca','australia':'au','new zealand':'nz',
};

export function resolveCode(raw) {
  if (!raw) return null;
  const s = String(raw).trim();
  if (!s) return null;
  // Already a valid 2-letter ISO code
  if (s.length === 2) return s.toLowerCase();
  // 3-letter alpha-3 code — use proper lookup table
  if (s.length === 3) {
    const upper = s.toUpperCase();
    return ALPHA3_TO_2[upper] || s.slice(0, 2).toLowerCase();
  }
  // Full name lookup
  const lower = s.toLowerCase();
  return NAME_TO_CODE[lower] || null;
}

export default function CountryFlag({ countryCode, className = 'w-5 h-4', style }) {
  const [code, setCode] = useState(() => resolveCode(countryCode));

  useEffect(() => {
    setCode(resolveCode(countryCode));
  }, [countryCode]);

  if (!code) return null;

  return (
    <img
      src={`https://flagcdn.com/48x36/${code}.png`}
      srcSet={`https://flagcdn.com/96x72/${code}.png 2x`}
      alt={code.toUpperCase()}
      className={`${className} object-cover rounded-sm inline-block flex-shrink-0`}
      style={style}
      onError={(e) => {
        e.currentTarget.style.display = 'none';
        const span = document.createElement('span');
        span.textContent = code.toUpperCase();
        span.style.fontSize = '14px';
        e.currentTarget.parentNode.insertBefore(span, e.currentTarget);
      }}
    />
  );
}
