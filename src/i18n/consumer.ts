export type ConsumerLocale = 'es' | 'en';

const es = {
  meta: {
    title: 'Verifire | Mis garantías',
    description: 'Escaneá el QR de tus productos para activar su garantía oficial y consultá tus certificados de autenticidad.'
  },
  scan: {
    camera: 'Abrir cámara', upload: 'Subir imagen del QR', preview: 'Vista de la cámara', close: 'Cerrar cámara',
    asking: 'Pidiendo permiso para usar la cámara...',
    aim: 'Apuntá la cámara al QR de la etiqueta.',
    reading: 'Leyendo la imagen...',
    noQrInImage: 'No encontramos un QR en la imagen. Probá con una imagen más nítida y cercana.',
    unreadableImage: 'No pudimos leer esa imagen. Probá con otra imagen del QR.',
    cameraFailed: 'No pudimos abrir la cámara. Subí o pegá (Ctrl+V) una imagen del QR.',
    cameraInsecure: 'La cámara solo funciona si Verifire se abre con https:// o desde localhost. Mientras tanto, subí o pegá (Ctrl+V) una imagen del QR.',
    cameraUnsupported: 'Este navegador no permite usar la cámara. Subí o pegá (Ctrl+V) una imagen del QR.',
    cameraBlocked: 'La cámara está bloqueada. Tocá el candado junto a la dirección, permití la cámara y volvé a intentar (en Windows revisá también Configuración > Privacidad > Cámara).',
    cameraMissing: 'No encontramos ninguna cámara en este dispositivo. Subí o pegá (Ctrl+V) una imagen del QR.',
    cameraBusy: 'La cámara está en uso por otra aplicación (Zoom, Teams, Meet...). Cerrala y volvé a intentar.'
  },
  coverage: {
    title: 'Cobertura restante', remaining: '{remaining} de {total} días', oneDay: '1 día restante', days: '{days} días restantes',
    expired: 'Cobertura vencida', active: 'Garantía vigente', pending: 'Cobertura aún no iniciada', unknown: 'Fechas de cobertura no disponibles',
    start: 'Inicio', end: 'Vencimiento', vault: 'Mis garantías'
  },
  claim: {
    eyebrow: 'Acción rápida',
    title: 'Activá la garantía de tu producto',
    hint: 'Escaneá el QR de la etiqueta interna o raspadita del empaque original. También podés subir una imagen del QR o pegarla con',
    activate: 'Activar Garantía Oficial',
    detected: 'QR del producto detectado. Tocá «Activar Garantía Oficial» para registrarlo a tu nombre.',
    scanFirst: 'Primero escaneá el QR de la etiqueta interna del producto.',
    working: 'Verificando el QR y preparando tu garantía...',
    doneOnChain: 'La garantía de {model} quedó registrada en Stellar a tu nombre.',
    done: 'La garantía de {model} quedó activada a tu nombre.',
    publicQr: 'Ese es el QR público del producto: sirve para verificarlo. Para activar la garantía escaneá el QR de la etiqueta interna.',
    unknownQr: 'No reconocimos ese QR como un QR de Verifire.',
    unreadableQr: 'No pudimos leer ese QR. Escanealo de nuevo.',
    loading: 'Cargando tus garantías...',
    loadError: 'No se pudieron cargar tus garantías.',
    onceHint: 'Cada QR puede activarse una única vez.'
  },
  incoming: {
    eyebrow: 'Cambio de dueño',
    title: 'Te pasaron un producto',
    product: 'Producto', code: 'Código', owner: 'Dueño actual',
    note: 'Al aceptar, la garantía y el historial del producto pasan a tu cuenta, y el cambio de dueño queda registrado en Stellar. Tu wallet Cavos firma la aceptación: no pagás comisiones.',
    expired: 'Este link venció. Pedile al dueño que genere uno nuevo.',
    expiresIn: 'El link vence en',
    accept: 'Aceptar transferencia', discard: 'Descartar',
    reading: 'Leyendo el link de transferencia...',
    accepted: '¡Listo! {model} ya está a tu nombre. El cambio de dueño quedó registrado en Stellar.',
    given: '{model}: este producto fue transferido al usuario {to}. Quedó registrado en su historial.'
  },
  card: {
    claimedAt: 'Fecha de reclamo', coverage: 'Vigencia de la cobertura', until: 'Garantía oficial hasta',
    certificate: 'Ver certificado en Stellar',
    certificateTitle: 'Transacción pública que certificó esta garantía en el contrato Verifire (Stellar testnet)',
    history: 'Historial del producto',
    transfer: 'Transferir a otra persona', newLink: 'Generar un link nuevo', cancel: 'Cancelar transferencia',
    qrAlt: 'QR del link de transferencia', copy: 'Copiar link', copied: 'Link copiado',
    linkExpiresIn: 'El link vence en',
    linkElsewhere: 'Abriste este link desde otro navegador. Si no lo tenés, generá uno nuevo: el anterior deja de funcionar.',
    linkExpired: 'El link de transferencia venció sin que nadie lo aceptara. El producto sigue a tu nombre.',
    linkLabel: 'Link para el nuevo dueño',
    linkOpen: 'Transferencia abierta: el producto pasa a quien abra el link con su cuenta Verifire y lo acepte.',
    linkReady: 'Link listo. Compartilo con el nuevo dueño: el producto pasa a su cuenta cuando lo acepte.',
    linkCancelled: 'Transferencia cancelada: el link ya no funciona.',
    confirmCancelTitle: '¿Cancelar la transferencia?',
    confirmCancel: 'El link deja de funcionar y el producto sigue a tu nombre. Podés generar otro cuando quieras.',
    confirmCancelYes: 'Cancelar la transferencia',
    keep: 'Volver'
  },
  vault: {
    transferred: 'Productos que transferiste',
    transferredBadge: 'Transferido',
    transferredNote: 'Este producto fue transferido al usuario {to} el {date}. La garantía sigue vigente a su nombre.',
    transferLink: 'Ver la transferencia en Stellar',
    transferTitle: 'Transacción pública del cambio de dueño (Stellar testnet)',
    empty: 'No tenés garantías registradas todavía. Escaneá el QR de tu producto arriba para reclamar tu certificado de autenticidad.',
    pagesActive: 'Páginas de garantías activas', pagesTransferred: 'Páginas de productos transferidos',
    count: '{count} productos', countOne: '1 producto'
  },
  device: {
    prompt: 'Este navegador todavía no está habilitado para firmar con tu cuenta.',
    retry: 'Reintentar',
    working: 'Habilitando este navegador para firmar...',
    password: 'Tu contraseña de Verifire', placeholder: 'La misma con la que entrás',
    hint: 'Con tu contraseña habilitamos este navegador para firmar y repetimos lo que estabas haciendo. No se guarda en ningún lado.',
    wrongPassword: 'Esa no es la contraseña de tu cuenta.',
    cancel: 'Cancelar',
    noWallet: 'Todavía no encontramos tu wallet. Recargá la página e intentá de nuevo.'
  },
  history: {
    minted: 'Registrado en el contrato', shipped: 'Despachado a su destino', verified: 'Verificado con el QR público',
    activated: 'Garantía activada con el QR secreto', rejected: 'Activación rechazada', transferred: 'Transferido a otro usuario',
    link: 'Ver en Stellar', linkTitle: 'Transacción pública en Stellar testnet',
    labelIssued: 'Etiqueta emitida', transferredTo: 'Transferido al usuario {to}'
  }
  ,
  support: {
    action: 'Gestionar garantía / Soporte', title: 'Gestionar garantía', close: 'Cerrar',
    intro: 'Reuní los datos de tu producto para solicitar asistencia al vendedor o fabricante.',
    instructions: 'Contactá al vendedor o fabricante por el canal indicado en tu comprobante de compra. Presentá este resumen junto con tu factura y describí el problema del producto.',
    note: 'Este resumen no envía una solicitud de soporte ni reemplaza el certificado en Stellar.',
    product: 'Producto', lot: 'Lote', serial: 'Identificador', owner: 'Titular', network: 'Red',
    certificate: 'Ver certificado en Stellar', noCertificate: 'Este producto todavía no tiene un certificado registrado en Stellar.',
    download: 'Descargar resumen de garantía', downloaded: 'Resumen descargado', downloadError: 'No se pudo descargar el resumen. Intentá nuevamente.',
    document: 'Verifire · Resumen de garantía', issued: 'Generado el', missing: 'No disponible'
  }
};

type Messages = typeof es;
const en: Messages = {
  meta: {
    title: 'Verifire | My warranties',
    description: 'Scan the QR of your products to activate their official warranty and check your certificates of authenticity.'
  },
  scan: {
    camera: 'Open camera', upload: 'Upload QR image', preview: 'Camera preview', close: 'Close camera',
    asking: 'Asking for permission to use the camera...',
    aim: 'Point the camera at the QR on the label.',
    reading: 'Reading the image...',
    noQrInImage: 'We found no QR in that image. Try a sharper, closer one.',
    unreadableImage: 'We could not read that image. Try another image of the QR.',
    cameraFailed: 'We could not open the camera. Upload or paste (Ctrl+V) an image of the QR.',
    cameraInsecure: 'The camera only works when Verifire is opened over https:// or from localhost. In the meantime, upload or paste (Ctrl+V) an image of the QR.',
    cameraUnsupported: 'This browser does not allow the camera. Upload or paste (Ctrl+V) an image of the QR.',
    cameraBlocked: 'The camera is blocked. Open the padlock next to the address, allow the camera and try again (on Windows check Settings > Privacy > Camera too).',
    cameraMissing: 'We found no camera on this device. Upload or paste (Ctrl+V) an image of the QR.',
    cameraBusy: 'The camera is in use by another application (Zoom, Teams, Meet...). Close it and try again.'
  },
  coverage: {
    title: 'Remaining coverage', remaining: '{remaining} of {total} days', oneDay: '1 day remaining', days: '{days} days remaining',
    expired: 'Coverage expired', active: 'Warranty active', pending: 'Coverage has not started', unknown: 'Coverage dates unavailable',
    start: 'Start', end: 'Expiry', vault: 'My warranties'
  },
  claim: {
    eyebrow: 'Quick action',
    title: 'Activate your product warranty',
    hint: 'Scan the QR on the inner label or scratch-off of the original packaging. You can also upload a QR image or paste one with',
    activate: 'Activate Official Warranty',
    detected: 'Product QR detected. Choose “Activate Official Warranty” to register it in your name.',
    scanFirst: 'Scan the QR on the product’s inner label first.',
    working: 'Checking the QR and preparing your warranty...',
    doneOnChain: 'The warranty for {model} is now recorded on Stellar in your name.',
    done: 'The warranty for {model} is now active in your name.',
    publicQr: 'That is the product’s public QR: it is for checking the product. To activate the warranty, scan the QR on the inner label.',
    unknownQr: 'We did not recognise that QR as a Verifire QR.',
    unreadableQr: 'We could not read that QR. Scan it again.',
    loading: 'Loading your warranties...',
    loadError: 'Your warranties could not be loaded.',
    onceHint: 'Each QR can be activated only once.'
  },
  incoming: {
    eyebrow: 'Change of owner',
    title: 'Someone sent you a product',
    product: 'Product', code: 'Code', owner: 'Current owner',
    note: 'When you accept, the warranty and the product history move to your account, and the change of owner is recorded on Stellar. Your Cavos wallet signs the acceptance: you pay no fees.',
    expired: 'This link has expired. Ask the owner to generate a new one.',
    expiresIn: 'The link expires in',
    accept: 'Accept transfer', discard: 'Dismiss',
    reading: 'Reading the transfer link...',
    accepted: 'Done. {model} is now in your name. The change of owner is recorded on Stellar.',
    given: '{model}: this product was transferred to user {to}. It is recorded in its history.'
  },
  card: {
    claimedAt: 'Claim date', coverage: 'Coverage period', until: 'Official warranty until',
    certificate: 'View certificate on Stellar',
    certificateTitle: 'Public transaction that certified this warranty in the Verifire contract (Stellar testnet)',
    history: 'Product history',
    transfer: 'Transfer to someone else', newLink: 'Generate a new link', cancel: 'Cancel transfer',
    qrAlt: 'QR of the transfer link', copy: 'Copy link', copied: 'Link copied',
    linkExpiresIn: 'The link expires in',
    linkElsewhere: 'You opened this link from another browser. If you do not have it, generate a new one: the previous one stops working.',
    linkExpired: 'The transfer link expired before anyone accepted it. The product is still in your name.',
    linkLabel: 'Link for the new owner',
    linkOpen: 'Transfer open: the product moves to whoever opens the link with their Verifire account and accepts it.',
    linkReady: 'Link ready. Share it with the new owner: the product moves to their account when they accept it.',
    linkCancelled: 'Transfer cancelled: the link no longer works.',
    confirmCancelTitle: 'Cancel the transfer?',
    confirmCancel: 'The link stops working and the product stays in your name. You can generate another one whenever you want.',
    confirmCancelYes: 'Cancel the transfer',
    keep: 'Go back'
  },
  vault: {
    transferred: 'Products you transferred',
    transferredBadge: 'Transferred',
    transferredNote: 'This product was transferred to user {to} on {date}. The warranty remains valid in their name.',
    transferLink: 'View the transfer on Stellar',
    transferTitle: 'Public transaction of the change of owner (Stellar testnet)',
    empty: 'You have no warranties registered yet. Scan the QR of your product above to claim your certificate of authenticity.',
    pagesActive: 'Pages of active warranties', pagesTransferred: 'Pages of transferred products',
    count: '{count} products', countOne: '1 product'
  },
  device: {
    prompt: 'This browser cannot sign with your account yet.',
    retry: 'Try again',
    working: 'Enabling this browser to sign...',
    password: 'Your Verifire password', placeholder: 'The same one you sign in with',
    hint: 'With your password we enable this browser to sign and repeat what you were doing. It is not stored anywhere.',
    wrongPassword: 'That is not your account password.',
    cancel: 'Cancel',
    noWallet: 'We have not found your wallet yet. Reload the page and try again.'
  },
  history: {
    minted: 'Registered in the contract', shipped: 'Shipped to its destination', verified: 'Checked with the public QR',
    activated: 'Warranty activated with the secret QR', rejected: 'Activation rejected', transferred: 'Transferred to another user',
    link: 'View on Stellar', linkTitle: 'Public transaction on Stellar testnet',
    labelIssued: 'Label issued', transferredTo: 'Transferred to user {to}'
  }
  ,
  support: {
    action: 'Manage warranty / Support', title: 'Manage warranty', close: 'Close',
    intro: 'Gather your product details to request assistance from the seller or manufacturer.',
    instructions: 'Contact the seller or manufacturer using the channel on your purchase receipt. Share this summary with your invoice and describe the product issue.',
    note: 'This summary does not submit a support request or replace the certificate on Stellar.',
    product: 'Product', lot: 'Batch', serial: 'Identifier', owner: 'Owner', network: 'Network',
    certificate: 'View certificate on Stellar', noCertificate: 'This product does not have a certificate recorded on Stellar yet.',
    download: 'Download warranty summary', downloaded: 'Summary downloaded', downloadError: 'Could not download the summary. Please try again.',
    document: 'Verifire · Warranty summary', issued: 'Generated on', missing: 'Unavailable'
  }
};

// "3 productos" / "1 producto", and the {placeholders} of the messages above.
export const fillIn = (text: string, values: Record<string, string | number>) =>
  text.replace(/\{(\w+)\}/g, (match, key) => String(values[key] ?? match));

export type ConsumerMessages = Messages;
export const getConsumerMessages = (locale: ConsumerLocale = 'es'): Messages => locale === 'en' ? en : es;
export const consumerDate = (value: string | null, locale: ConsumerLocale = 'es') => {
  const date = value ? new Date(value) : null;
  return date && Number.isFinite(date.getTime())
    ? new Intl.DateTimeFormat(locale === 'en' ? 'en-US' : 'es-AR', { dateStyle: 'medium' }).format(date)
    : getConsumerMessages(locale).support.missing;
};
