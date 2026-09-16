import { join } from 'node:path';
import {
  ADMIN_API_TOKEN, CAVOS_APP_ID, CORS_ORIGIN, COSMOS_PAY_AMOUNT, COSMOS_PAY_API_KEY, COSMOS_PAY_DESTINATION, DATA_FILE,
  PUBLIC_APP_URL, STELLAR_ADMIN_SECRET, STELLAR_CONTRACT_ID, STELLAR_ISSUER_SECRET, STELLAR_NETWORK, STELLAR_RPC_URL
} from 'astro:env/server';
import { stellarConfigFromEnv } from './stellar';

// An empty line in .env (KEY=) means the value is not set.
export const config = {
  cosmosPay: {
    apiKey: COSMOS_PAY_API_KEY || '',
    // Treasury account: receives the payment of each batch and never signs on-chain.
    destination: COSMOS_PAY_DESTINATION || '',
    // Test amount per token, in XLM.
    amountPerToken: COSMOS_PAY_AMOUNT || '5'
  },
  cavosAppId: CAVOS_APP_ID || '',
  adminApiToken: ADMIN_API_TOKEN || '',
  corsOrigin: CORS_ORIGIN || '',
  publicAppUrl: PUBLIC_APP_URL?.replace(/\/$/, '') || '',
  // Relative to where the server is started, which is the project root for every npm script.
  dataFile: DATA_FILE || join(process.cwd(), 'data', 'verifire-state.json'),
  network: STELLAR_NETWORK || 'local-demo',
  contractId: STELLAR_CONTRACT_ID || null,
  stellar: stellarConfigFromEnv({ STELLAR_CONTRACT_ID, STELLAR_ISSUER_SECRET, STELLAR_ADMIN_SECRET, STELLAR_RPC_URL })
};

// Base of the links inside QR codes: PUBLIC_APP_URL when set, otherwise the address this request reached.
export const publicBaseUrl = (requestUrl: URL) => config.publicAppUrl || requestUrl.origin;
