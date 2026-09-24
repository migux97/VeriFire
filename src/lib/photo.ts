// The photo of a batch: what the product looks like, shown to whoever verifies it and, when its buyer chooses so, on
// the home page. Pure: the browser prepares the photo and the server checks it with the same functions.

// A JPEG, PNG or WebP as a data URL. The browser sends a JPEG of at most 960 px, about 60 to 120 KB.
export const PHOTO_LIMIT = 190_000;
// The request that carries it is bigger than the default limit of the API.
export const PHOTO_REQUEST_LIMIT = 220 * 1024;
export const PHOTO_MAX_SIDE = 960;

const PHOTO_DATA_URL = /^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/]+={0,2})$/;

// The first bytes of each format as base64: JPEG "FF D8 FF", PNG "89 50 4E 47 0D 0A 1A 0A", WebP "RIFF....WEBP".
const SIGNATURES = { jpeg: '/9j/', png: 'iVBORw0KGgo', webp: 'UklGR' } as const;

export type PhotoFormat = keyof typeof SIGNATURES;

// The format of a valid photo, or null. It has to say what it is and start with the bytes of that format.
export const photoFormat = (value: string): PhotoFormat | null => {
  if (value.length > PHOTO_LIMIT) return null;
  const match = PHOTO_DATA_URL.exec(value);
  if (!match) return null;
  const format = match[1] as PhotoFormat;
  const body = match[2] ?? '';
  if (!body.startsWith(SIGNATURES[format])) return null;
  // A WebP is a RIFF container: bytes 4 to 7 are the size and bytes 8 to 11 say "WEBP".
  if (format === 'webp' && riffKind(body) !== 'WEBP') return null;
  return format;
};

// The four letters at bytes 8..11 of a base64 string, read with atob so browser and server share this file.
function riffKind(base64: string) {
  try {
    const bytes = atob(base64.slice(0, 16));
    return bytes.slice(8, 12);
  } catch {
    return '';
  }
}

export const photoMime = (format: PhotoFormat) => `image/${format}`;
