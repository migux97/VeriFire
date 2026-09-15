# Verifire Product Contract

Contrato Soroban para registrar productos en Stellar testnet.

## Funciones

- `initialize(admin)`: configura la cuenta administradora una sola vez.
- `mint_product(public_code, model, lot, destination, activation_key)`: registra un producto sellado. `activation_key` es la clave pública ed25519 derivada del secreto interno; el secreto nunca se envía a la red.
- `get_product(token_id)`: consulta los datos públicos, propietario y estado.
- `get_product_by_code(public_code)`: busca un producto por su QR público.
- `activation_message(token_id, claimant)`: devuelve los bytes exactos que hay que firmar para activar. Se puede obtener simulando la llamada.
- `activate_product(token_id, claimant, signature)`: exige la firma de `claimant`, verifica que `signature` fue hecha con la clave derivada del secreto y activa la garantía una sola vez.

## Por qué el secreto no viaja en la transacción

Los argumentos de una transacción son públicos: si el secreto se enviara en texto plano, cualquiera podría leerlo en el historial o verlo en una transacción pendiente y reclamar el producto primero. Por eso:

1. **Derivación (fuera de la cadena).** `seed = sha256("verifire-activation-v1:" + secreto)`; con esa semilla se crea un par de claves ed25519.
2. **Emisión.** El emisor registra solo la clave pública (`activation_key`).
3. **Activación.** El navegador del comprador deriva la clave desde el secreto, firma `activation_message(token_id, claimant)` y envía únicamente la firma. El mensaje incluye el contrato, el token y la cuenta reclamante, así que una firma copiada no sirve para reclamar con otra cuenta.

Ejemplo con `@stellar/stellar-sdk`:

```js
import { Keypair, hash } from '@stellar/stellar-sdk';

const seed = hash(Buffer.from(`verifire-activation-v1:${secret}`)); // sha256
const activationKeypair = Keypair.fromRawEd25519Seed(seed);

// Al emitir:
const activationKey = activationKeypair.rawPublicKey(); // BytesN<32>

// Al activar (message = resultado simulado de activation_message):
const signature = activationKeypair.sign(message); // BytesN<64>
```

El QR del producto debe contener una URL pública como:

```text
https://TU-DOMINIO/verify.html?token=VF-001
```

La web leerá `token` y mostrará modelo, lote, destino y estado `SEALED`. El QR público nunca contiene el secreto interno. Nunca se debe aceptar una clave privada de la cuenta en el navegador.

El servidor devuelve `blockchainBacked: true` únicamente cuando existe `STELLAR_CONTRACT_ID`; hasta entonces el estado local es deliberadamente visible como demo.

## Tests

```powershell
cargo test
```

## Requisitos de despliegue

Instala Rust, `rustup`, el target `wasm32-unknown-unknown` y Stellar CLI. Después:

```powershell
rustup target add wasm32-unknown-unknown
stellar contract build
stellar contract deploy `
  --wasm target/wasm32-unknown-unknown/release/verifire_product.wasm `
  --network testnet `
  --source ADMIN_SECRET_KEY
```

Guarda el contract ID en una variable de entorno del servidor. Nunca pongas la clave secreta de administración en el navegador.
