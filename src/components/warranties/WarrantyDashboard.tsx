// The buyer's panel: scan the secret QR inside a product, activate its warranty, list the warranties already owned and
// pass them on to a new owner through a transfer link, or accept one.
import { useStore } from '@nanostores/react';
import { useEffect, useRef, useState, type SubmitEvent } from 'react';
import { Icon } from '@/components/ui/Icon';
import { StatusMessage, type Message, type MessageTone } from '@/components/ui/StatusMessage';
import { useNow } from '@/components/ui/useNow';
import { storedUser, updateStoredUser } from '@/lib/client/account';
import { activateWarranty } from '@/lib/client/activation';
import { ApiError, getJson } from '@/lib/client/api';
import { verifyPassword, deviceCodeFor } from '@/lib/client/password';
import {
  captureClaimLink, keepPendingClaim, keepPendingTransfer, parseScannedQr, takePendingClaim, takePendingTransfer, type ScannedClaim
} from '@/lib/client/qr';
import { leaveSession, userSession } from '@/lib/client/session';
import {
  acceptTransfer, cancelTransfer, offerTransfer, readTransferLink, savedTransferLink, type IncomingTransfer
} from '@/lib/client/transfer';
import { DeviceNotReadyError, EmailCodeRequiredError, enableSigning, hasDeviceFactor, resolveWalletAddress, storedDeviceCode } from '@/lib/client/wallet';
import { errorMessage } from '@/lib/errors';
import { formatCountdown } from '@/lib/format';
import type { TransferredWarranty, Warranty, WarrantiesResponse } from '@/lib/types';
import { isStellarAddress } from '@/lib/validation';
import { $deviceEnrollmentOffered, $deviceFormOpen } from '@/stores/devices';
import { DeviceEnrollForm } from './DeviceEnrollForm';
import { QrScanPanel } from './QrScanPanel';
import { WarrantyVault, type TransferControls } from './WarrantyVault';

// While a transfer link is open, the list is checked this often, so the owner sees when someone accepts it.
const TRANSFER_POLL_MS = 8000;

const DETECTED_MESSAGE = 'QR del producto detectado. Tocá "Activar Garantía Oficial" para registrarlo a tu nombre.';

interface WarrantyDashboardProps {
  cavosAppId: string;
}

export function WarrantyDashboard({ cavosAppId }: WarrantyDashboardProps) {
  const [message, setMessage] = useState<Message | null>(null);
  const [scannedClaim, setScannedClaim] = useState<ScannedClaim | null>(null);
  const [claiming, setClaiming] = useState(false);
  const [warranties, setWarranties] = useState<Warranty[] | null>(null);
  const [transferred, setTransferred] = useState<TransferredWarranty[]>([]);
  const [vaultStatus, setVaultStatus] = useState<string | null>('Cargando tus garantías...');
  const [incoming, setIncoming] = useState<{ secret: string; transfer: IncomingTransfer } | null>(null);
  const [accepting, setAccepting] = useState(false);
  const [transferLinks, setTransferLinks] = useState<Record<string, string>>({});
  const [busyToken, setBusyToken] = useState<string | null>(null);
  const [transferStatuses, setTransferStatuses] = useState<Record<string, Message>>({});
  const deviceFormOpen = useStore($deviceFormOpen);
  // What failed because this browser could not sign yet: "Reintentar" enables it and runs it again.
  const [repair, setRepair] = useState<{ run: () => Promise<void> } | null>(null);
  const [repairing, setRepairing] = useState(false);
  const now = useNow(incoming !== null);
  const incomingExpired = incoming !== null && new Date(incoming.transfer.expiresAt).getTime() <= now;
  const walletAddress = useRef('');
  const claimButtonRef = useRef<HTMLButtonElement>(null);

  const showMessage = (text: string, tone: MessageTone) => setMessage({ text, tone });

  useEffect(() => {
    if (scannedClaim) claimButtonRef.current?.focus();
  }, [scannedClaim]);

  // quiet: a background check, which neither shows "Cargando" nor replaces the list with an error.
  const loadWarranties = async ({ quiet = false } = {}) => {
    if (!quiet) setVaultStatus('Cargando tus garantías...');
    try {
      walletAddress.current ||= await resolveWalletAddress(cavosAppId);
      const data = await getJson<WarrantiesResponse>(`/api/warranties?owner=${encodeURIComponent(walletAddress.current)}`, 'No se pudieron cargar tus garantías.');
      setWarranties(data.warranties);
      setTransferred(data.transferred);
      // Links this browser opened can be shared again; the secret of a link lives only here.
      setTransferLinks(Object.fromEntries(data.warranties.flatMap((warranty) => {
        const link = warranty.transferOfferedAt ? savedTransferLink(warranty.token) : null;
        return link ? [[warranty.token, link]] : [];
      })));
      setVaultStatus(null);
      return data;
    } catch (error) {
      if (!quiet) setVaultStatus(errorMessage(error));
      return null;
    }
  };

  // An open link is accepted in someone else's browser: check until it happens and tell the owner right away.
  const openOffers = warranties?.filter((warranty) => warranty.transferExpiresAt).map((warranty) => warranty.token).join(',') ?? '';
  useEffect(() => {
    if (!openOffers) return undefined;
    const tokens = openOffers.split(',');
    const timer = window.setInterval(async () => {
      const data = await loadWarranties({ quiet: true });
      const given = data?.transferred.find((product) => tokens.includes(product.token));
      if (given) showMessage(`${given.model}: este producto fue transferido al usuario ${given.to}. Quedó registrado en su historial.`, 'success');
    }, TRANSFER_POLL_MS);
    return () => window.clearInterval(timer);
  }, [openOffers]);

  // Enables this browser to sign and saves the account's key in Stellar, so every other device can sign too.
  const enrollDeviceFactor = async (deviceCode: string) => {
    const address = walletAddress.current || storedUser()?.walletAddress || '';
    if (!isStellarAddress(address)) throw new Error('Todavía no encontramos tu wallet. Recargá la página e intentá de nuevo.');
    await enableSigning(cavosAppId, address, deviceCode);
    $deviceEnrollmentOffered.set(false);
  };

  // The key is derived from the password this account uses in this browser.
  const deviceCodeFromPassword = async (password: string) => {
    const account = storedUser();
    if (!account || !(await verifyPassword(account, password))) throw new Error('Esa no es la contraseña de tu cuenta.');
    return deviceCodeFor(account.email, password);
  };

  // Offers "Reintentar" when the error is one this browser can fix with the password.
  const offerRepair = (error: unknown, run: () => Promise<void>) => {
    if (error instanceof DeviceNotReadyError && error.canRetry) setRepair({ run });
  };

  const repairAndRetry = async (password?: string) => {
    if (!repair) return;
    setRepairing(true);
    showMessage('Habilitando este navegador para firmar...', 'info');
    try {
      await enrollDeviceFactor(password ? await deviceCodeFromPassword(password) : storedDeviceCode());
      setRepair(null);
      await repair.run();
    } catch (error) {
      showMessage(errorMessage(error), 'error');
    } finally {
      setRepairing(false);
    }
  };

  // It happens by itself when the login left the derived key in this tab; otherwise the profile menu offers it.
  const enableOtherDevices = async () => {
    const address = walletAddress.current || storedUser()?.walletAddress || '';
    if (!isStellarAddress(address) || await hasDeviceFactor(address) !== false) return;
    const deviceCode = storedDeviceCode();
    if (!deviceCode) {
      $deviceEnrollmentOffered.set(true);
      return;
    }
    try {
      await enrollDeviceFactor(deviceCode);
      showMessage('Tu cuenta quedó habilitada para usarse en el celular: entrá ahí con tu correo y contraseña.', 'success');
    } catch (error) {
      $deviceEnrollmentOffered.set(true);
      console.warn('No se pudo habilitar el uso en varios dispositivos:', errorMessage(error));
    }
  };

  const enrollWithPassword = async (password: string) => {
    showMessage('Habilitando tu cuenta para otros dispositivos...', 'info');
    try {
      await enrollDeviceFactor(await deviceCodeFromPassword(password));
      $deviceFormOpen.set(false);
      showMessage('Listo: ya podés entrar desde el celular con tu correo y tu contraseña.', 'success');
    } catch (error) {
      showMessage(errorMessage(error), 'error');
    }
  };

  // The wallet cannot be reconnected without confirming the Gmail again: ask for a code at login and come back.
  const leaveForEmailCode = () => {
    updateStoredUser({ emailVerifiedAt: 0 });
    leaveSession('verificar');
  };

  const ownerAddress = async () => (walletAddress.current ||= await resolveWalletAddress(cavosAppId));

  // A transfer link opened or scanned: show what it offers before accepting.
  const openTransferLink = async (secret: string) => {
    setIncoming(null);
    showMessage('Leyendo el link de transferencia...', 'info');
    try {
      setIncoming({ secret, transfer: await readTransferLink(secret, await ownerAddress()) });
      setMessage(null);
    } catch (error) {
      showMessage(errorMessage(error), 'error');
    }
  };

  const handleAcceptTransfer = async () => {
    if (!incoming) return;
    setRepair(null);
    setAccepting(true);
    try {
      const warranty = await acceptTransfer(cavosAppId, incoming.transfer, await ownerAddress(), (progress) => showMessage(progress, 'info'));
      setIncoming(null);
      showMessage(`¡Listo! ${warranty.model} ya está a tu nombre. El cambio de dueño quedó registrado en Stellar.`, 'success');
      await loadWarranties();
    } catch (error) {
      if (error instanceof EmailCodeRequiredError) {
        keepPendingTransfer(incoming.secret);
        leaveForEmailCode();
        return;
      }
      offerRepair(error, handleAcceptTransfer);
      showMessage(errorMessage(error), 'error');
    } finally {
      setAccepting(false);
    }
  };

  // Opening and cancelling a link: the owner's wallet signs, and the card shows how it went.
  const runTransfer = async (token: string, task: (owner: string, onProgress: (text: string) => void) => Promise<Warranty>, done: string) => {
    const setStatus = (text: string, tone: MessageTone) => setTransferStatuses((current) => ({ ...current, [token]: { text, tone } }));
    setRepair(null);
    setBusyToken(token);
    try {
      const warranty = await task(await ownerAddress(), (progress) => setStatus(progress, 'info'));
      setWarranties((current) => current?.map((candidate) => (candidate.token === token ? warranty : candidate)) ?? current);
      setStatus(done, 'success');
    } catch (error) {
      if (error instanceof EmailCodeRequiredError) {
        leaveForEmailCode();
        return;
      }
      setStatus(errorMessage(error), 'error');
      if (error instanceof DeviceNotReadyError && error.canRetry) {
        // The button lives next to the panel's message, at the top.
        offerRepair(error, () => runTransfer(token, task, done));
        showMessage(errorMessage(error), 'error');
      }
    } finally {
      setBusyToken(null);
    }
  };

  const transfers: TransferControls = {
    links: transferLinks,
    busyToken,
    statuses: transferStatuses,
    onOffer: (token) => void runTransfer(token, async (owner, onProgress) => {
      const { warranty, link } = await offerTransfer(cavosAppId, token, owner, onProgress);
      setTransferLinks((current) => ({ ...current, [token]: link }));
      return warranty;
    }, 'Link listo. Compartilo con el nuevo dueño: el producto pasa a su cuenta cuando lo acepte.'),
    onCancel: (token) => {
      if (!window.confirm('¿Cancelar la transferencia? El link deja de funcionar.')) return;
      void runTransfer(token, async (owner, onProgress) => {
        const warranty = await cancelTransfer(cavosAppId, token, owner, onProgress);
        setTransferLinks(({ [token]: _closed, ...rest }) => rest);
        return warranty;
      }, 'Transferencia cancelada: el link ya no funciona.');
    }
  };

  const applyScannedText = (text: string) => {
    const { claim, publicToken, transfer } = parseScannedQr(text);
    if (transfer) {
      setScannedClaim(null);
      void openTransferLink(transfer);
      return;
    }
    setScannedClaim(claim);
    if (claim) {
      showMessage(DETECTED_MESSAGE, 'success');
      return;
    }
    showMessage(publicToken
      ? 'Ese es el QR público del producto: sirve para verificarlo. Para activar la garantía escaneá el QR de la etiqueta interna.'
      : 'No reconocimos ese QR como un QR de Verifire.', 'error');
  };

  const handleClaim = (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!scannedClaim) {
      showMessage('Primero escaneá el QR de la etiqueta interna del producto.', 'error');
      return;
    }
    void claim(scannedClaim);
  };

  const claim = async (scannedClaim: ScannedClaim) => {
    setRepair(null);
    setClaiming(true);
    showMessage('Verificando el QR y preparando tu garantía...', 'info');
    try {
      const owner = walletAddress.current || await resolveWalletAddress(cavosAppId);
      const product = await activateWarranty(cavosAppId, scannedClaim, owner, (progress) => showMessage(progress, 'info'));
      setScannedClaim(null);
      showMessage(product.certificateUrl
        ? `¡Listo! La garantía de ${product.model} quedó registrada en Stellar a tu nombre.`
        : `¡Listo! La garantía de ${product.model} quedó activada a tu nombre.`, 'success');
      await loadWarranties();
    } catch (error) {
      // The wallet cannot be reconnected without confirming the Gmail again: keep the QR and ask for a code at login.
      if (error instanceof EmailCodeRequiredError) {
        keepPendingClaim(scannedClaim);
        leaveForEmailCode();
        return;
      }
      // A QR that does not exist or was already used will not work on a retry.
      if (error instanceof ApiError && error.status < 500 && !error.retryable) setScannedClaim(null);
      offerRepair(error, () => claim(scannedClaim));
      showMessage(errorMessage(error), 'error');
    } finally {
      setClaiming(false);
    }
  };

  useEffect(() => {
    // Without a session the page's guard is already sending the user to the login page.
    if (!userSession.isActive()) return;

    captureClaimLink();
    const pendingTransfer = takePendingTransfer();
    const pendingClaim = takePendingClaim();
    if (pendingClaim === 'invalid') {
      showMessage('No pudimos leer ese QR. Escanealo de nuevo.', 'error');
    } else if (pendingClaim) {
      setScannedClaim(pendingClaim);
      showMessage(DETECTED_MESSAGE, 'success');
    }

    void loadWarranties()
      .then(() => (pendingTransfer ? openTransferLink(pendingTransfer) : undefined))
      .then(enableOtherDevices);
    // Runs once per page load.
  }, []);

  return (
    <>
      {incoming && (
        <section className="claim-card transfer-card" aria-labelledby="transfer-title">
          <div>
            <span className="eyebrow">Cambio de dueño</span>
            <h2 id="transfer-title">Te pasaron un producto</h2>
          </div>
          <dl className="transfer-summary">
            <div><dt>Producto</dt><dd>{incoming.transfer.model}</dd></div>
            <div><dt>Código</dt><dd>{incoming.transfer.token}</dd></div>
            <div><dt>Dueño actual</dt><dd>{incoming.transfer.from}</dd></div>
          </dl>
          <p className="claim-hint">
            Al aceptar, la garantía y el historial del producto pasan a tu cuenta, y el cambio de dueño queda registrado en Stellar. Tu wallet Cavos firma la aceptación: no pagás comisiones.
          </p>
          <p className="transfer-countdown" role="timer">
            <Icon name="fa-regular fa-clock" />
            {incomingExpired
              ? ' Este link venció. Pedile al dueño que genere uno nuevo.'
              : <> El link vence en <strong>{formatCountdown(incoming.transfer.expiresAt, now)}</strong></>}
          </p>
          <div className="scan-actions">
            <button className="button button-primary" type="button" disabled={accepting || incomingExpired} onClick={() => void handleAcceptTransfer()}>
              Aceptar transferencia
            </button>
            <button className="button button-secondary" type="button" disabled={accepting} onClick={() => setIncoming(null)}>Descartar</button>
          </div>
        </section>
      )}

      <section className="claim-card" aria-labelledby="claim-title">
        <div>
          <span className="eyebrow">Acción rápida</span>
          <h1 id="claim-title">Activá la garantía de tu producto</h1>
        </div>
        <p className="claim-hint">
          Escaneá el QR de la etiqueta interna o raspadita del empaque original. También podés subir una imagen del QR o pegarla con <kbd>Ctrl</kbd> + <kbd>V</kbd>. Cada QR puede activarse una única vez.
        </p>
        <QrScanPanel
          onDetected={applyScannedText}
          onMessage={setMessage}
          onScanStart={() => setScannedClaim(null)}
        />
        <StatusMessage id="claim-message" message={message} />
        {repair && (storedDeviceCode()
          ? (
            <button className="button button-primary" type="button" disabled={repairing} onClick={() => void repairAndRetry()}>
              <Icon name="fa-solid fa-rotate-right" /> Reintentar
            </button>
          )
          : (
            <DeviceEnrollForm
              submitLabel="Reintentar"
              hint="Con tu contraseña habilitamos este navegador para firmar y repetimos lo que estabas haciendo. No se guarda en ningún lado."
              onEnroll={repairAndRetry}
              onCancel={() => setRepair(null)}
            />
          ))}
        <form id="claim-form" noValidate hidden={!scannedClaim} onSubmit={handleClaim}>
          <button ref={claimButtonRef} className="button button-primary" type="submit" disabled={claiming}>Activar Garantía Oficial</button>
        </form>
        {deviceFormOpen && (
          <DeviceEnrollForm
            submitLabel="Habilitar"
            hint="Con tu contraseña habilitamos tu cuenta para usarla en el celular. Es una sola vez y no se guarda en ningún lado."
            onEnroll={enrollWithPassword}
            onCancel={() => $deviceFormOpen.set(false)}
          />
        )}
      </section>

      <WarrantyVault warranties={warranties} status={vaultStatus} transfers={transfers} transferred={transferred} />
    </>
  );
}
