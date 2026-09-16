// The Cavos kit, loaded on demand: it is large and only needed to sign in and to sign on Stellar.
// The kit (and the Stellar code inside it) expects Node's `Buffer` and `global`, which browsers do not have: without
// them creating the buyer's Stellar account fails with "Buffer is not defined". Keep this import first.
import './node-globals';

export { Cavos, CavosAuth } from '@cavos/kit';
