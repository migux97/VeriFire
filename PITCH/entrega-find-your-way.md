# Find Your Way: Meridian submission

Material for the submission (closes 2026-10-12 23:59 UTC): the project description to paste in the form, and the
script of the 3-minute video.

## Project description

**VeriFire: product authenticity and warranties that the brand signs and the buyer owns, on Stellar.**

Counterfeits move more than USD 500 billion a year, and a serial number printed on a box can be copied by anyone.
Warranties are a paper or an email that gets lost, and when a product is resold its history does not travel with it.

VeriFire gives each physical unit a record in a Soroban contract and two QR codes:

- **Public QR, outside the box.** Anyone scans it in the shop, with no app and no account, and sees the model, the
  batch, the destination, whether the warranty was already activated, and which company issued it.
- **Secret QR, sealed inside the box.** The buyer scans it once to activate the warranty. Their wallet becomes the
  product's owner in the contract, and they can later hand it to the next owner with a single-use transfer link.

**What makes it trustless where it matters:**

- The buyer's ownership is set by the buyer's own signature. The secret never goes on-chain: the contract stores the
  public key derived from it and checks an ed25519 signature, so the activation cannot be front-run or replayed.
- The company signs its own products. One wallet signature covers a whole batch (the Merkle root of its products), and
  each product is linked with a proof that the contract checks. VeriFire cannot attach a brand to a product the brand
  did not sign.
- The only claim that remains VeriFire's is "this wallet belongs to company X". It is written on-chain, public and
  dated, and it can be withdrawn.

**Built for people who have never used crypto.** Buyers sign in with email or Google and get a Cavos wallet; the
issuing account sponsors every fee, so nobody needs XLM. Companies pay for batches through Cosmos Pay and manage
labels, activations and support from a panel.

**Stellar integration:** Soroban contract in Rust (registration, activation, transfers, issuer signatures, verification),
Cavos smart wallets, Cosmos Pay for batch payments, Stellar Expert links on every certificate. All on testnet.

**Business model:** B2B, USD 0.025 to 0.25 per registered product depending on volume. Each registration costs less than
USD 0.003 in network fees. First market: wineries in Cafayate, Argentina, which must now declare the traceability of
their export lots themselves.

**Links:**

- Live app: https://verifire.cosmosapp.lat
- Repository: https://github.com/migux97/VeriFire
- Contract: https://stellar.expert/explorer/testnet/contract/CDFW7UROVQAU462KD2HI2XTOTP7BFSIQE3Q32K3FRN7ONPKGYIQV2EI6
- Try it: a verified product at https://verifire.cosmosapp.lat/verify?token=VF-013, and sealed demo QR codes to activate
  in `docs/demo-qrs/`

## Video script (3 minutes)

About 420 spoken words. The times are a guide; what matters is reaching the demo before 0:45.

**0:00 – 0:20 · El problema**
*En pantalla: una caja con un número de serie, luego "+USD 500.000 millones al año".*
"Un número de serie impreso en una caja lo copia cualquiera. Las falsificaciones mueven más de 500 mil millones de
dólares al año, y la garantía suele ser un papel que se pierde. Cuando el producto se revende, su historia no viaja
con él."

**0:20 – 0:40 · La idea**
*En pantalla: la caja con el QR público afuera y el QR secreto bajo el sello.*
"VeriFire le da a cada producto un registro en un contrato de Stellar y dos QR. El público, afuera, lo escanea
cualquiera en la tienda. El secreto, sellado adentro, lo usa una sola vez el comprador para activar la garantía."

**0:40 – 1:10 · Demo: la empresa**
*En pantalla: el panel de empresa. Comprar un lote con Cosmos Pay, abrir el lote, tocar "Firmar el lote", la wallet
firma, aparece "Lote firmado" con el link a Stellar Expert.*
"La empresa compra un lote y lo paga con Cosmos Pay. Cada producto queda registrado en el contrato. Ahora la empresa
firma el lote con su propia wallet: una sola firma cubre todo el lote, y desde ese momento el contrato dice qué
empresa emitió cada producto. No lo dice VeriFire: lo prueba la firma de la empresa."

**1:10 – 1:30 · Demo: en la tienda**
*En pantalla: escanear el QR público con el celular. `/verify` muestra "Producto original", la empresa verificada y
"La wallet de la empresa firmó este producto en Stellar".*
"En la tienda, cualquiera escanea el QR público, sin app ni cuenta. Ve el modelo, el lote, que está sellado, y qué
empresa lo firmó, con el link a la transacción."

**1:30 – 2:00 · Demo: el comprador**
*En pantalla: `/app`, ingreso con email, escanear el QR secreto, firmar, el certificado con "Ver en Stellar". Después
abrir el link de transferencia.*
"El comprador escanea el QR secreto y entra con su email. No necesita saber nada de cripto ni tener XLM: se crea una
wallet y nosotros pagamos la comisión. Firma, y el producto queda a su nombre en el contrato. Si lo revende, abre un
link de transferencia y la garantía pasa al nuevo dueño."

**2:00 – 2:30 · Por qué Stellar, y por qué no hay que confiar en nosotros**
*En pantalla: el contrato en Stellar Expert, con `get_issuer` e `issuer_verification`.*
"¿Por qué confiar en VeriFire? Para lo importante, no hace falta. El dueño lo define la firma del comprador, la empresa
firma sus propios productos, y el contrato de Soroban verifica las dos cosas. Lo único que sigue siendo palabra
nuestra es qué empresa está detrás de cada wallet, y eso también queda escrito on-chain, público y con fecha. Cada
registro cuesta menos de un tercio de centavo."

**2:30 – 3:00 · Negocio y cierre**
*En pantalla: modelo de negocio, Cafayate, link a la app y QR al repositorio.*
"Cobramos a las marcas entre 2,5 y 25 centavos de dólar por producto registrado. Empezamos con las bodegas de
Cafayate, que desde este año tienen que declarar la trazabilidad de sus lotes de exportación. VeriFire ya está en
línea en testnet: escaneá, verificá y activá un producto vos mismo."

**Antes de grabar:** el contrato tiene que estar actualizado (`npm run contract:upgrade`) y el servidor desplegado con la
firma de lotes; si no, el botón "Firmar el lote" no aparece. Usá `VF-D5MB996H`, reservado para la grabación del equipo.
