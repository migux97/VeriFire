# Landing, languages and carousel notes

Moved out of the main README (in Spanish, as originally written).

## Idiomas

La landing está disponible en español en `/` y en inglés en `/en/`, con un selector ES/EN en el encabezado. El idioma
elegido ahí (o con `?lang=en`) queda en la cookie `verifireLang`, porque las demás pantallas tienen una sola ruta: el
panel del comprador (`/app`) y las páginas públicas `/verify` y `/batch` lo leen y responden en ese idioma, igual que
sus fechas y el `lang` del documento. El panel de empresa sigue solo en español.

- `src/i18n/landing.ts` contiene los textos de interfaz de ambos idiomas, incluidos los nombres accesibles de los controles. Al agregar una clave, completá las dos traducciones.
- `src/i18n/technical-landing.ts` contiene el hero de doble factor, el auditor de ejemplo, los cinco casos de uso y la documentación de integración en ES/EN.
- `src/i18n/consumer.ts` contiene el panel del comprador y `src/i18n/verify.ts` las páginas públicas detrás de los QR impresos.
- `src/components/landing/content.ts` contiene los ejemplos y textos en español; `src/i18n/landing-content.ts` reúne sus traducciones al inglés.
- Guardá las fechas de ejemplo como `YYYY-MM-DD`; la interfaz las presenta con `Intl.DateTimeFormat` según el idioma de la ruta.
- `UseCaseCarousel.tsx` usa `useCaseRotation.ts` para rotar relojería, perfumería, vinos, autopartes y cosmética cada 4000 ms. Incluye flechas anterior/siguiente, navegación por teclado y cinco indicadores de ancho fijo. `CaseSpecifications.tsx` presenta el lote y los detalles técnicos de cada ejemplo. `landing-motion.css` combina crossfade de 600 ms y escala 1.05 → 1 al entrar / 1 → 0.95 al salir, con curva `cubic-bezier(.16, 1, .3, 1)`. Los textos entran 75 ms después, durante 550 ms. Los paneles comparten una celda de grid para reservar la altura del más alto y evitar saltos de layout. La barra utiliza una animación lineal persistente de 4000 ms: se pausa/reanuda sin recrearla y conserva su llenado al desvanecerse tras un cambio manual. Con movimiento reducido se omite el movimiento y sus retardos, pero los productos siguen rotando. Las pestañas ocultas suspenden el temporizador hasta volver a la página.
- El carrusel de industrias conserva el tiempo restante mientras el mouse está sobre la tarjeta, se mantiene un dedo apoyado, se navega con teclado o se abre el historial. Retirar el mouse, soltar el dedo, sacar el foco o cerrar el historial permite reanudar. Pulsar un indicador con mouse o un toque breve no deja la reproducción pausada.
- Si Windows o el navegador solicitan movimiento reducido, el carrusel usa un desvanecido de 350 ms sin zoom ni desplazamiento. Esta excepción local evita que la regla global de 0.01 ms convierta el cambio en un corte instantáneo; no modifica la preferencia del sistema.
- `AuditWidget.tsx` mantiene Pulse ANC (VF-1043) fijo e independiente del carrusel. Su único estado local selecciona qué QR inspeccionar; conectores visuales distinguen la etiqueta exterior del precinto interno. Presenta datos ilustrativos de Testnet, sin consultar ni simular una conexión real. Los costos por operación no se expresan como una tarifa fija en dólares.
- Tailwind está integrado con Vite, con utilidades `tw:` y sin Preflight para preservar el CSS del resto de la aplicación. Los tokens, códigos de lote, rutas internas e identificadores de producto no se traducen.
