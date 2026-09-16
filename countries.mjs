// Markets a company can pick as the destination of a batch. Only ISO country codes are stored here: the Spanish
// names come from Node's own Intl data, so the list needs no hand-written table and reads the same everywhere.
// The region is what turns a country into the destination printed on labels ("Argentina · LATAM").
const REGION_CODES = {
  LATAM: ['AR', 'BO', 'BR', 'CL', 'CO', 'CR', 'CU', 'DO', 'EC', 'SV', 'GT', 'HN', 'MX', 'NI', 'PA', 'PY', 'PE', 'PR', 'UY', 'VE'],
  'América del Norte': ['CA', 'US'],
  Europa: ['DE', 'AT', 'BE', 'BG', 'HR', 'DK', 'SK', 'SI', 'ES', 'EE', 'FI', 'FR', 'GR', 'HU', 'IE', 'IS', 'IT', 'LV', 'LT', 'LU', 'MT', 'NO', 'NL', 'PL', 'PT', 'GB', 'CZ', 'RO', 'RS', 'SE', 'CH', 'UA'],
  Asia: ['SA', 'AE', 'BD', 'CN', 'KR', 'PH', 'HK', 'IN', 'ID', 'IL', 'JP', 'JO', 'KW', 'MY', 'PK', 'QA', 'SG', 'LK', 'TH', 'TW', 'TR', 'VN'],
  África: ['AO', 'DZ', 'EG', 'ET', 'GH', 'KE', 'MA', 'NG', 'ZA', 'TN'],
  Oceanía: ['AU', 'NZ', 'FJ']
};

const countryNames = new Intl.DisplayNames('es', { type: 'region' });

export const countries = Object.entries(REGION_CODES)
  .flatMap(([region, codes]) => codes.map((code) => ({ code, name: countryNames.of(code), region })))
  .sort((first, second) => first.name.localeCompare(second.name, 'es'));

const byCode = new Map(countries.map((country) => [country.code, country]));

// What is stored in the product and printed on its label. Empty when the code is not one of the listed markets.
export const destinationForCountry = (code) => {
  const country = byCode.get(String(code || '').trim().toUpperCase());
  return country ? `${country.name} · ${country.region}` : '';
};
