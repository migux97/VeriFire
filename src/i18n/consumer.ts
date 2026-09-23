export type ConsumerLocale = 'es' | 'en';

const es = {
  meta: {
    title: 'Verifire | Mis garantías',
    description: 'Escaneá el QR de tus productos para activar su garantía oficial y consultá tus certificados de autenticidad.'
  },
  wallet: { address: 'Dirección de tu wallet', unavailable: 'Wallet no disponible', copy: 'Copiar dirección', copied: 'Dirección copiada', copyError: 'No se pudo copiar la dirección', network: 'Stellar Testnet' },
  scan: {
    camera: 'Abrir cámara', upload: 'Subir imagen del QR', preview: 'Vista de la cámara', close: 'Cerrar cámara',
    manual: 'Ingresar código manual', label: 'Código privado de activación', validate: 'Validar código',
    hint: 'Ingresá el código de la etiqueta interna o pegá el enlace del QR privado. El número de serie y el QR público no activan la garantía.',
    placeholder: 'VF-SECRET-… o enlace del QR privado',
    invalid: 'Ingresá un código privado o un enlace de activación de Verifire válido.',
    public: 'Este es el QR público. Para activar la garantía necesitás el código de la etiqueta interna.',
    ready: 'Formato del código reconocido. Tocá «Activar Garantía Oficial» para comprobarlo y registrar la garantía a tu nombre.'
  },
  coverage: {
    title: 'Cobertura restante', remaining: '{remaining} de {total} días', oneDay: '1 día restante', days: '{days} días restantes',
    expired: 'Cobertura vencida', active: 'Garantía vigente', pending: 'Cobertura aún no iniciada', unknown: 'Fechas de cobertura no disponibles',
    start: 'Inicio', end: 'Vencimiento', vault: 'Mis garantías'
  },
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
  wallet: { address: 'Your wallet address', unavailable: 'Wallet unavailable', copy: 'Copy address', copied: 'Address copied', copyError: 'Could not copy the address', network: 'Stellar Testnet' },
  scan: {
    camera: 'Open camera', upload: 'Upload QR image', preview: 'Camera preview', close: 'Close camera',
    manual: 'Enter code manually', label: 'Private activation code', validate: 'Validate code',
    hint: 'Enter the code from the inner label or paste the private QR link. The serial number and public QR cannot activate a warranty.',
    placeholder: 'VF-SECRET-… or private QR link',
    invalid: 'Enter a valid Verifire private code or activation link.',
    public: 'This is the public QR. You need the code from the inner label to activate your warranty.',
    ready: 'Code format recognized. Choose “Activate Official Warranty” to verify it and register the warranty in your name.'
  },
  coverage: {
    title: 'Remaining coverage', remaining: '{remaining} of {total} days', oneDay: '1 day remaining', days: '{days} days remaining',
    expired: 'Coverage expired', active: 'Warranty active', pending: 'Coverage has not started', unknown: 'Coverage dates unavailable',
    start: 'Start', end: 'Expiry', vault: 'My warranties'
  },
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

export const getConsumerMessages = (locale: ConsumerLocale = 'es'): Messages => locale === 'en' ? en : es;
export const consumerDate = (value: string | null, locale: ConsumerLocale = 'es') => {
  const date = value ? new Date(value) : null;
  return date && Number.isFinite(date.getTime())
    ? new Intl.DateTimeFormat(locale === 'en' ? 'en-US' : 'es-AR', { dateStyle: 'medium' }).format(date)
    : getConsumerMessages(locale).support.missing;
};
