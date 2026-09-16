// Shared by the profile menu in the header and the warranty panel, which hydrate as separate islands.
// Accounts created before multi-device access existed need it saved once, with the password.
import { atom } from 'nanostores';

// The profile menu offers "Habilitar en mis otros dispositivos".
export const $deviceEnrollmentOffered = atom(false);

// The password form of the warranty panel is open.
export const $deviceFormOpen = atom(false);
