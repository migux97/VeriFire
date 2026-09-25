// Whether a product may be shown on the home page: its batch needs a photo, and the company that issued it has to be
// verified by Verifire (see verification.ts). Without the second, the carousel would say "original" about products
// whose issuer nobody checked. One rule for every place that asks: the preview before activating, the activation itself,
// the warranty card, the change afterwards and the carousel.
import { publishedIssuerOf } from './brands';
import { photoOfBatch } from './photos';

export type ShowcaseBlock = 'photo' | 'unverified';

export const showcaseBlockOf = (batchId: string | undefined): ShowcaseBlock | null => {
  if (photoOfBatch(batchId) === null) return 'photo';
  return publishedIssuerOf(batchId)?.verified ? null : 'unverified';
};
