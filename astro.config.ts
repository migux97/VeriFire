import node from '@astrojs/node';
import react from '@astrojs/react';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig, envField, fontProviders } from 'astro/config';

// Every variable is declared `secret`, even the ones that are not: only secret server variables are read at runtime
// (from `node --env-file=.env` in production); public ones are frozen into the build. So one build serves any
// configuration, and none of them reaches the browser: pages pass what the client needs as props.
const runtimeVar = () => envField.string({ context: 'server', access: 'secret', optional: true });

export default defineConfig({
  i18n: {
    defaultLocale: 'es',
    locales: ['es', 'en'],
    routing: { prefixDefaultLocale: false }
  },
  output: 'server',
  adapter: node({ mode: 'standalone' }),
  integrations: [react()],
  vite: {
    plugins: [tailwindcss()],
    // Dependencies imported lazily (the wallet on login, QR codes and the camera scanner when first used) are prepared
    // up front: discovered mid-session, Vite re-optimizes and reloads the page, cutting off whatever was running (such
    // as turning on the company panel's demo mode).
    optimizeDeps: { include: ['@cavos/kit', 'buffer', 'qrcode', 'jsqr', 'nanostores', '@nanostores/react'] }
  },
  // Accounts and sessions live in each browser; the server keeps no per-user state.
  session: false,
  // Cavos keeps each wallet's signing key per site address, and existing accounts were created on this port.
  server: {
    port: 5501,
    // The dev server also answers through an ngrok tunnel (npm run tunnel), to scan the QR labels from a phone.
    allowedHosts: ['.ngrok-free.app', '.ngrok-free.dev', '.ngrok.app', '.ngrok.dev']
  },
  fonts: [
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
      // Written by the deploy script: the contract STELLAR_CONTRACT_ID replaced, so its products get registered again.
      STELLAR_PREVIOUS_CONTRACT_ID: runtimeVar(),
      STELLAR_ISSUER_SECRET: runtimeVar(),
      // Old name of STELLAR_ISSUER_SECRET.
      STELLAR_ADMIN_SECRET: runtimeVar(),
      STELLAR_RPC_URL: runtimeVar(),
      // Resend (resend.com): sends the team invitations by email. The sender must belong to a domain verified there.
      RESEND_API_KEY: runtimeVar(),
      RESEND_FROM: runtimeVar()
    }
  }
});
