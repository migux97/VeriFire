// Whether Verifire vouches for a company. Nobody can verify themselves: an administrator checks the company by hand
// (tax id, legal name, its site) and records the trade name that was checked. The verification only counts while the
// company keeps showing that name to its buyers, so a verified company cannot start signing as another one.
//
// What a buyer reads follows from it (see brands.ts):
//  - verified issuer → "original", with the name and the site that were checked;
//  - anything else   → "registered in Verifire": the code is unique and was not copied, and that is all Verifire promises.
//
// Kept apart from the actions (verification-actions.ts) because the rest of the server reads it, and the actions read
// the rest of the server.
import type { VerificationState } from '../types';
import type { Workspace } from './store';

const normalize = (name: string) =>
  name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();

export const sameName = (first: string, second: string) => normalize(first) === normalize(second);

// True for a company that was verified and still shows the name that was checked: the brand it published, or, when it
// published none, the checked name itself is what its buyers read.
export const isVerified = (workspace: Workspace | undefined) => {
  const verification = workspace?.verification;
  if (verification?.status !== 'verified' || !verification.name) return false;
  return !workspace?.brand || sameName(workspace.brand.name, verification.name);
};

export const verificationView = (workspace: Workspace | undefined): VerificationState => {
  const verification = workspace?.verification;
  return {
    status: verification?.status ?? 'none',
    active: isVerified(workspace),
    ...(verification?.name ? { name: verification.name } : {}),
    ...(verification?.domain ? { domain: verification.domain } : {}),
    // The note is the reason of a rejection: the company reads it.
    ...(verification?.status === 'rejected' && verification.note ? { note: verification.note } : {}),
    ...(verification?.message ? { message: verification.message } : {}),
    ...(verification?.requestedAt ? { requestedAt: verification.requestedAt } : {}),
    ...(verification?.decidedAt ? { decidedAt: verification.decidedAt } : {})
  };
};
