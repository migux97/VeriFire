# Verifire Product Contract

Contrato Soroban para registrar productos en Stellar testnet.

## Funciones

- `initialize(admin)`: configura la cuenta administradora una sola vez.
- `mint_product(public_code, model, lot, destination, activation_key)`: registra un producto sellado. `activation_key` es la clave pública ed25519 derivada del secreto interno; el secreto nunca se envía a la red.
- `get_product(token_id)`: consulta los datos públicos, propietario y estado.
- `get_product_by_code(public_code)`: busca un producto por su QR público.
- `activation_message(token_id, claimant)`: devuelve los bytes exactos que hay que firmar para activar. Se puede obtener simulando la llamada.
- `activate_product(token_id, claimant, signature)`: exige la firma de `claimant`, verifica que `signature` fue hecha con la clave derivada del secreto y activa la garantía una sola vez.
- `offer_transfer(token_id, owner, transfer_key)`: el dueño abre un link de transferencia. `transfer_key` es la clave pública derivada de un secreto aleatorio que crea su navegador (`sha256("verifire-transfer-v1:" + secreto)`). Un link nuevo reemplaza al anterior. El link vence a los 15 minutos (`TRANSFER_LINK_SECONDS`), y el dueño puede abrir otro cuando quiera.
- `transfer_times(token_id)`: `(vence, último_link)` en segundos del ledger, 0 si no hay.
- `cancel_transfer(token_id, owner)`: el dueño cierra el link abierto.
- `transfer_message(token_id, recipient)`: bytes que el link tiene que firmar para aceptar, atados al contrato, al token y a quien recibe.
- `accept_transfer(token_id, recipient, signature)`: exige la firma de `recipient`, verifica la firma del link y le pasa el producto. El link sirve una sola vez.
- `import_claimed_product(...)`: solo admin. Registra un producto ya activado, con su dueño, al pasar los productos a un contrato nuevo.
- `upgrade(new_wasm_hash)`: solo admin. Reemplaza el código del contrato sin cambiar su dirección ni sus datos. Se usa con `npm run contract:upgrade` después de compilar.

La activación y la transferencia emiten los eventos `activated` y `transfer`.

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
https://TU-DOMINIO/verify?token=VF-001
```

La web leerá `token` y mostrará modelo, lote, destino y estado `SEALED`. Las etiquetas impresas con `verify.html?token=...` siguen funcionando: redirigen a `/verify`. El QR público nunca contiene el secreto interno. Nunca se debe aceptar una clave privada de la cuenta en el navegador.

El servidor devuelve `blockchainBacked: true` únicamente cuando existe `STELLAR_CONTRACT_ID`; hasta entonces el estado local es deliberadamente visible como demo.

## Tests

```powershell
cargo test
```

## Despliegue en testnet

No hace falta Stellar CLI: el despliegue usa `@stellar/stellar-sdk` desde Node.

```powershell
rustup target add wasm32v1-none
cd contracts/verifire_product
cargo build --target wasm32v1-none --release
cd ../..
npm run contract:deploy
```

El script crea y fondea con friendbot una cuenta admin, sube el wasm, crea e inicializa el contrato y guarda `STELLAR_CONTRACT_ID`, `STELLAR_ADMIN_SECRET` y `STELLAR_NETWORK=testnet` en `.env` sin mostrar la clave. Con `--force` despliega un contrato nuevo aunque ya haya uno configurado.

Para comprobar el flujo completo contra la red (registro, firma del QR, autorización del comprador y activación):

```powershell
npm run contract:test-activation
```

## Dos cuentas separadas

- **Cuenta de tesorería** (`COSMOS_PAY_DESTINATION`): cobra los pagos de Cosmos Pay por cada lote. No firma nada en el contrato y no aparece en ninguna respuesta que vea un comprador.
- **Cuenta emisora o notaría** (`STELLAR_ISSUER_SECRET`, antes `STELLAR_ADMIN_SECRET`): registra productos, certifica garantías y paga las tarifas de red de esas transacciones. Solo necesita un saldo chico para tarifas, que se recarga aparte desde la tesorería.

El comprador solo ve el certificado de su producto: la transacción de activación firmada por la cuenta emisora. El pago del lote se muestra únicamente en el panel de empresa. Por eso la cuenta emisora paga sus propias tarifas: si las pagara la tesorería, esa cuenta figuraría en cada certificado y el cliente podría llegar a las finanzas de la empresa.

## Cómo lo usa el servidor

- **Emisión:** cuando Cosmos Pay confirma el pago de un lote, el servidor (`src/lib/server/purchases.ts`) llama a `mint_product` por cada producto desde la cuenta admin (`src/lib/server/stellar.ts`).
- **Activación:** el navegador deriva la clave de activación del QR secreto, pide `activation_message`, lo firma y envía solo la clave pública y la firma. El servidor arma la transacción `activate_product`; la wallet Cavos del comprador firma únicamente su autorización (`require_auth`). La cuenta admin la envía y paga la comisión, así que el comprador no necesita XLM.
- **Comprobación:** el servidor guarda la garantía recién cuando `get_product` muestra al comprador como dueño, con el hash de la transacción como certificado público.
- **Cambio de dueño:** desde Mis garantías el dueño abre un link (`/app#t=<secreto>`). El secreto va después del `#`, así que nunca llega al servidor. Quien lo abre deriva la clave, firma `transfer_message` y su wallet Cavos autoriza `accept_transfer`. Igual que en la activación, la cuenta emisora paga la comisión (`src/lib/server/transfers.ts`).
- **Contrato nuevo:** `npm run contract:deploy -- --force` guarda el contrato reemplazado en `STELLAR_PREVIOUS_CONTRACT_ID`. Al arrancar, el servidor registra en el contrato nuevo los productos sellados (`mint_product`) y los activados con su dueño (`import_claimed_product`).

La clave secreta de administración vive solo en el `.env` del servidor. Nunca la pongas en el navegador.
