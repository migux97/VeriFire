// Source of buffer.bundle.js. The Cavos kit (and the Stellar code inside it) expects Node's global Buffer, which
// browsers do not have: without it, creating the buyer's Stellar account fails with "Buffer is not defined".
// Build it with: npm run build:buffer
// It also uses `global` unguarded (global.Array), another Node-only name, so both are defined here.
import { Buffer } from 'buffer';

globalThis.Buffer ||= Buffer;
globalThis.global ||= globalThis;
