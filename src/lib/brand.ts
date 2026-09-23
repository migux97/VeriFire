// What a company publishes about itself to its buyers, and the rules that keep it safe to publish. Pure: the browser
// builds the brand from the profile and the server checks it with the same functions, so both agree on what is valid.
//
// Only what the company chooses to show goes here. The tax id, the legal name, the address and the internal contact of
// the profile never leave the account.

export interface PublicBrand {
  // Trade name.
  name: string;
  website: string;
  description: string;
  supportEmail: string;
  supportPhone: string;
  // A PNG as a data URL, or '' without a logo.
  logo: string;
}

export const BRAND_LIMITS = { name: 100, website: 200, description: 280, email: 254, phone: 40, logo: 56_000 } as const;

const EMAIL = /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,}$/;
const PHONE = /^\+?[0-9][0-9 ()\-.]{4,39}$/;
const WEBSITE = /^https?:\/\/[^\s.]+\.[^\s]+$/i;
// The first bytes of every PNG (89 50 4E 47 0D 0A 1A 0A), as base64.
const PNG_DATA_URL = /^data:image\/png;base64,iVBORw0KGgo[A-Za-z0-9+/]+={0,2}$/;

export const isEmail = (value: string) => value.length <= BRAND_LIMITS.email && EMAIL.test(value);
export const isPhone = (value: string) => PHONE.test(value);
export const isWebsite = (value: string) => value.length <= BRAND_LIMITS.website && WEBSITE.test(value);
export const isPngDataUrl = (value: string) => value.length <= BRAND_LIMITS.logo && PNG_DATA_URL.test(value);

// "Andes Tech S.A." → "andes-tech-s-a": lower case, no accents, no spaces, safe to put in a URL.
export const slugify = (name: string) => {
  const slug = name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
    .replace(/-+$/g, '');
  return slug || 'empresa';
};
