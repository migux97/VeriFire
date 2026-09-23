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

## Idiomas de la landing

La landing está disponible en español en `/` y en inglés en `/en/`, con un selector ES/EN en el encabezado. Las pantallas internas mantienen su idioma actual.

- `src/i18n/landing.ts` contiene los textos de interfaz de ambos idiomas, incluidos los nombres accesibles de los controles. Al agregar una clave, completá las dos traducciones.
- `src/i18n/technical-landing.ts` contiene el hero de doble factor, el auditor de ejemplo, los cinco casos de uso y la documentación de integración en ES/EN.
- `src/components/landing/content.ts` contiene los ejemplos y textos en español; `src/i18n/landing-content.ts` reúne sus traducciones al inglés.
- Guardá las fechas de ejemplo como `YYYY-MM-DD`; la interfaz las presenta con `Intl.DateTimeFormat` según el idioma de la ruta.
- `UseCaseCarousel.tsx` usa `useCaseRotation.ts` para rotar relojería, perfumería, vinos, autopartes y cosmética cada 4000 ms. Incluye flechas anterior/siguiente, navegación por teclado y cinco indicadores de ancho fijo. `CaseSpecifications.tsx` presenta el lote y los detalles técnicos de cada ejemplo. `landing-motion.css` combina crossfade de 600 ms y escala 1.05 → 1 al entrar / 1 → 0.95 al salir, con curva `cubic-bezier(.16, 1, .3, 1)`. Los textos entran 75 ms después, durante 550 ms. Los paneles comparten una celda de grid para reservar la altura del más alto y evitar saltos de layout. La barra utiliza una animación lineal persistente de 4000 ms: se pausa/reanuda sin recrearla y conserva su llenado al desvanecerse tras un cambio manual. Con movimiento reducido se omite el movimiento y sus retardos, pero los productos siguen rotando. Las pestañas ocultas suspenden el temporizador hasta volver a la página.
- El carrusel de industrias conserva el tiempo restante mientras el mouse está sobre la tarjeta, se mantiene un dedo apoyado, se navega con teclado o se abre el historial. Retirar el mouse, soltar el dedo, sacar el foco o cerrar el historial permite reanudar. Pulsar un indicador con mouse o un toque breve no deja la reproducción pausada.
- Si Windows o el navegador solicitan movimiento reducido, el carrusel usa un desvanecido de 350 ms sin zoom ni desplazamiento. Esta excepción local evita que la regla global de 0.01 ms convierta el cambio en un corte instantáneo; no modifica la preferencia del sistema.
- `AuditWidget.tsx` mantiene Pulse ANC (VF-1043) fijo e independiente del carrusel. Su único estado local selecciona qué QR inspeccionar; conectores visuales distinguen la etiqueta exterior del precinto interno. Presenta datos ilustrativos de Testnet, sin consultar ni simular una conexión real. Los costos por operación no se expresan como una tarifa fija en dólares.
- Tailwind está integrado con Vite, con utilidades `tw:` y sin Preflight para preservar el CSS del resto de la aplicación. Los tokens, códigos de lote, rutas internas e identificadores de producto no se traducen.

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
  styles/           brand.css (colores y logo), global.css (base y vistas), landing.css y auth.css
scripts/            Scripts de despliegue y prueba del contrato (TypeScript ejecutado por Node)
contracts/          Contrato Soroban en Rust
```

## Rutas

| Ruta | Página |
| --- | --- |
| `/` | Landing pública de Verifire |
| `/login` | Ingreso y registro |
| `/app` | Panel del comprador: escanear QR y ver garantías |
| `/batches` | Panel de empresa: lotes, etiquetas y activaciones |
| `/admin` | Compra de un lote con Cosmos Pay |
| `/verify?token=VF-001` | Verificación pública de un producto (renderizada en el servidor) |
| `/batch?batch=BATCH-0001` | Verificación pública de un lote |

Las direcciones anteriores (`verify.html`, `app.html#q=...`, `activate.html`, etc.) redirigen a las nuevas conservando sus parámetros, así que las etiquetas ya impresas siguen funcionando. El retorno de Google sigue siendo `/index.html`, que es la URL registrada en el panel de Cavos, y redirige a `/login`.
