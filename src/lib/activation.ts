// Domains of the ed25519 keys derived from a secret: seed = sha256("<domain>:" + secret). They must match
// ACTIVATION_DOMAIN and TRANSFER_DOMAIN in contracts/verifire_product/src/lib.rs. The browser and the server derive the
// same keys. The activation secret is printed inside the box; a transfer secret travels only in a transfer link.
export const ACTIVATION_DOMAIN = 'verifire-activation-v1';
export const TRANSFER_DOMAIN = 'verifire-transfer-v1';
