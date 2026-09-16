import { config } from './config';
import { singleton } from './singleton';
import { createStellarClient } from './stellar';

// While STELLAR_CONTRACT_ID is empty (or the issuer key is missing) warranties are stored only locally: demo mode.
export const chain = singleton('stellar', () => createStellarClient(config.stellar));
