import node from '@astrojs/node';
import react from '@astrojs/react';
import { defineConfig, envField, fontProviders } from 'astro/config';

// Every variable is declared `secret`, even the ones that are not: only secret server variables are read at runtime
// (from `node --env-file=.env` in production); public ones are frozen into the build. So one build serves any
// configuration, and none of them reaches the browser: pages pass what the client needs as props.
const runtimeVar = () => envField.string({ context: 'server', access: 'secret', optional: true });

export default defineConfig({
  output: 'server',
  adapter: node({ mode: 'standalone' }),
  integrations: [react()],
  // Accounts and sessions live in each browser; the server keeps no per-user state.
  session: false,
  // Cavos keeps each wallet's signing key per site address, and existing accounts were created on this port.
  server: { port: 5501 },
  fonts: [
    {
      provider: fontProviders.fontsource(),
      name: 'Inter',
      cssVariable: '--font-inter',
      weights: [400, 500, 600, 700, 800, 900],
      styles: ['normal'],
      subsets: ['latin']
    },
    // Only the landing page (src/pages/index.astro) loads it.
    {
      provider: fontProviders.fontsource(),
      name: 'Urbanist',
      cssVariable: '--font-urbanist',
      weights: [500, 600, 700, 800, 900],
      styles: ['normal'],
      subsets: ['latin']
    }
  ],
  env: {
    schema: {
      // Cosmos Pay: testnet key (dv_...) and the treasury account that receives each batch payment.
      COSMOS_PAY_API_KEY: runtimeVar(),
      COSMOS_PAY_DESTINATION: runtimeVar(),
      COSMOS_PAY_AMOUNT: runtimeVar(),
      CAVOS_APP_ID: runtimeVar(),
      // Enables POST /api/products with `Authorization: Bearer <token>`.
      ADMIN_API_TOKEN: runtimeVar(),
      CORS_ORIGIN: runtimeVar(),
      // Base of the links printed in the QR labels. Defaults to the address the request came from.
      PUBLIC_APP_URL: runtimeVar(),
      DATA_FILE: runtimeVar(),
      STELLAR_NETWORK: runtimeVar(),
      STELLAR_CONTRACT_ID: runtimeVar(),
      STELLAR_ISSUER_SECRET: runtimeVar(),
      // Old name of STELLAR_ISSUER_SECRET.
      STELLAR_ADMIN_SECRET: runtimeVar(),
      STELLAR_RPC_URL: runtimeVar()
    }
  }
});
