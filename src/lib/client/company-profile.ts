// The company's public profile, edited in Configuración: logo, legal and contact data. Kept in this browser per
// account, outside the demo data. The trade name stays in the account (StoredUser.companyName), where the rest of the
// panel and the label configurator already read it.
import { storedUser, updateStoredUser } from './account';
import { userSession } from './session';
import { readStored, writeStored } from './storage';

export interface CompanyProfile {
  // A square PNG as a data URL, or '' without a logo.
  logo: string;
  legalName: string;
  taxId: string;
  industry: string;
  website: string;
  email: string;
  phone: string;
  country: string;
  address: string;
  description: string;
}

export const emptyProfile: CompanyProfile = {
  logo: '',
  legalName: '',
  taxId: '',
  industry: '',
  website: '',
  email: '',
  phone: '',
  country: '',
  address: '',
  description: ''
};

// Tells the islands that show the company (the sidebar, the profile chip) to read it again.
export const COMPANY_PROFILE_EVENT = 'verifire:company-profile-changed';

const LOGO_SIZE = 256;
const MAX_LOGO_BYTES = 5 * 1024 * 1024;
const LOGO_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml', 'image/gif'];

const profileKey = () => `verifire:company-profile:${userSession.email().toLowerCase()}`;

export const readCompanyProfile = (): CompanyProfile => ({ ...emptyProfile, ...(readStored<Partial<CompanyProfile>>(localStorage, profileKey()) ?? {}) });

export const companyName = () => storedUser()?.companyName ?? '';

// False when the browser would not store it (a full quota, most likely because of the logo).
export const saveCompanyProfile = (profile: CompanyProfile, name: string) => {
  if (!writeStored(localStorage, profileKey(), profile)) return false;
  updateStoredUser({ companyName: name });
  window.dispatchEvent(new Event(COMPANY_PROFILE_EVENT));
  return true;
};

export type LogoError = 'type' | 'size' | 'read';

// Fits any image into a transparent 256×256 square, so a logo of any size or shape takes little storage and shows
// the same everywhere.
export const prepareLogo = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    if (!LOGO_TYPES.includes(file.type)) return reject(new Error('type' satisfies LogoError));
    if (file.size > MAX_LOGO_BYTES) return reject(new Error('size' satisfies LogoError));
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      const canvas = document.createElement('canvas');
      canvas.width = LOGO_SIZE;
      canvas.height = LOGO_SIZE;
      const context = canvas.getContext('2d');
      const width = image.naturalWidth || LOGO_SIZE;
      const height = image.naturalHeight || LOGO_SIZE;
      if (!context) return reject(new Error('read' satisfies LogoError));
      const scale = Math.min(LOGO_SIZE / width, LOGO_SIZE / height);
      const drawnWidth = width * scale;
      const drawnHeight = height * scale;
      context.imageSmoothingQuality = 'high';
      context.drawImage(image, (LOGO_SIZE - drawnWidth) / 2, (LOGO_SIZE - drawnHeight) / 2, drawnWidth, drawnHeight);
      resolve(canvas.toDataURL('image/png'));
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('read' satisfies LogoError));
    };
    image.src = url;
  });
