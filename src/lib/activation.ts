// Domain of the activation key derived from a secret QR: seed = sha256("verifire-activation-v1:" + secret).
// Must match ACTIVATION_DOMAIN in contracts/verifire_product/src/lib.rs. The browser and the server derive the same key.
export const ACTIVATION_DOMAIN = 'verifire-activation-v1';
