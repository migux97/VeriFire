# VeriFire

Verificación de productos y garantías certificadas en Stellar. Las empresas compran lotes de tokens con Cosmos Pay e imprimen dos QR por producto; el comprador escanea el QR secreto para activar su garantía con su wallet Cavos.

## Stack

- [Astro 7](https://docs.astro.build) con salida `server` y el adaptador `@astrojs/node` (modo standalone).
- Islas de React 19 en TSX para las partes interactivas, con estado compartido entre islas mediante `nanostores`.
- TypeScript estricto (`astro/tsconfigs/strictest`) en todo el proyecto.
- Configuración tipada con `astro:env`, fuentes con la Fonts API de Astro e íconos de Font Awesome servidos localmente.
- Contrato Soroban en `contracts/verifire_product` (ver `contracts/README.md`).

## Puesta en marcha

Requiere Node 22.18 o superior.

```bash
npm install
cp .env.example .env   # completá las claves de Cosmos Pay, Cavos y Stellar
npm run dev            # http://localhost:5501
```

El puerto 5501 es fijo a propósito: Cavos guarda la llave de firma de cada wallet por dirección del sitio, y las cuentas existentes se crearon ahí.

| Script | Qué hace |
| --- | --- |
| `npm run dev` | Servidor de desarrollo |
| `npm run check` | Chequeo de tipos de `.astro`, `.ts` y `.tsx` |
| `npm run build` | Chequeo de tipos y build de producción en `dist/` |
| `npm start` | Servidor de producción (lee `.env` al arrancar) |
| `npm run contract:deploy` | Despliega el contrato en testnet y guarda sus datos en `.env` |
| `npm run contract:test-activation` | Prueba de punta a punta de la activación contra testnet |

Todas las variables de `.env` se leen en tiempo de ejecución, así que el mismo build sirve para cualquier configuración.

## Estructura

```text
src/
  pages/            Rutas: páginas .astro y endpoints de la API en pages/api
  layouts/          Layout base (head, fuentes, control de sesión)
  components/       Componentes .astro de layout e islas .tsx por funcionalidad
  stores/           Estado compartido entre islas (nanostores)
  lib/
    client/         Código del navegador: sesión, wallet Cavos, activación, lectura de QR
    server/         Código del servidor: estado, Cosmos Pay, Stellar, reglas de negocio
    types.ts        Contrato de la API compartido por servidor y cliente
  styles/           Hoja de estilos global
scripts/            Scripts de despliegue y prueba del contrato (TypeScript ejecutado por Node)
contracts/          Contrato Soroban en Rust
```

## Rutas

| Ruta | Página |
| --- | --- |
| `/` | Ingreso y registro |
| `/app` | Panel del comprador: escanear QR y ver garantías |
| `/lotes` | Panel de empresa: lotes, etiquetas y activaciones |
| `/admin` | Compra de un lote con Cosmos Pay |
| `/verify?token=VF-001` | Verificación pública de un producto (renderizada en el servidor) |
| `/batch?batch=BATCH-0001` | Verificación pública de un lote |

Las direcciones anteriores (`verify.html`, `app.html#q=...`, `activate.html`, etc.) redirigen a las nuevas conservando sus parámetros, así que las etiquetas ya impresas siguen funcionando. El retorno de Google sigue siendo `/index.html`, que es la URL registrada en el panel de Cavos.
