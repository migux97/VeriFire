import { Buffer } from 'buffer';

const scope = globalThis as typeof globalThis & { Buffer?: typeof Buffer; global?: typeof globalThis };
scope.Buffer ??= Buffer;
// The kit also reads `global` unguarded (global.Array).
scope.global ??= globalThis;
