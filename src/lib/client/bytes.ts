export const bytesToBase64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes));

export const base64ToBytes = (value: string) => Uint8Array.from(atob(value), (character) => character.charCodeAt(0));

export const base64UrlToBytes = (value: string) =>
  base64ToBytes(value.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(value.length / 4) * 4, '='));

export const bytesToHex = (bytes: Uint8Array) => Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
