// The buyer's panel: scan the secret QR inside a product, activate its warranty and list the warranties already owned.
import { useStore } from '@nanostores/react';
import { useEffect, useRef, useState, type SubmitEvent } from 'react';
import { StatusMessage, type Message, type MessageTone } from '@/components/ui/StatusMessage';
import { storedUser, updateStoredUser } from '@/lib/client/account';
import { activateWarranty } from '@/lib/client/activation';
import { ApiError, getJson } from '@/lib/client/api';
import { verifyPassword, deviceCodeFor } from '@/lib/client/password';
import { captureClaimLink, keepPendingClaim, parseScannedQr, takePendingClaim, type ScannedClaim } from '@/lib/client/qr';
import { leaveSession, userSession } from '@/lib/client/session';
import { connectSigningWallet, EmailCodeRequiredError, hasDeviceFactor, resolveWalletAddress, storedDeviceCode } from '@/lib/client/wallet';
import { errorMessage } from '@/lib/errors';
import type { Warranty, WarrantiesResponse } from '@/lib/types';
import { isStellarAddress } from '@/lib/validation';
import { $deviceEnrollmentOffered, $deviceFormOpen } from '@/stores/devices';
import { DeviceEnrollForm } from './DeviceEnrollForm';
import { QrScanPanel } from './QrScanPanel';
import { WarrantyVault } from './WarrantyVault';

const DETECTED_MESSAGE = 'QR del producto detectado. Tocá "Activar Garantía Oficial" para registrarlo a tu nombre.';

interface WarrantyDashboardProps {
  cavosAppId: string;
}

export function WarrantyDashboard({ cavosAppId }: WarrantyDashboardProps) {
  const [message, setMessage] = useState<Message | null>(null);
  const [scannedClaim, setScannedClaim] = useState<ScannedClaim | null>(null);
  const [claiming, setClaiming] = useState(false);
  const [warranties, setWarranties] = useState<Warranty[] | null>(null);
  const [vaultStatus, setVaultStatus] = useState<string | null>('Cargando tus garantías...');
  const deviceFormOpen = useStore($deviceFormOpen);
  const walletAddress = useRef('');
  const claimButtonRef = useRef<HTMLButtonElement>(null);

  const showMessage = (text: string, tone: MessageTone) => setMessage({ text, tone });

  useEffect(() => {
    if (scannedClaim) claimButtonRef.current?.focus();
  }, [scannedClaim]);

  const loadWarranties = async () => {
    setVaultStatus('Cargando tus garantías...');
    try {
      walletAddress.current = await resolveWalletAddress(cavosAppId);
      const data = await getJson<WarrantiesResponse>(`/api/warranties?owner=${encodeURIComponent(walletAddress.current)}`, 'No se pudieron cargar tus garantías.');
      setWarranties(data.warranties);
      setVaultStatus(null);
    } catch (error) {
      setVaultStatus(errorMessage(error));
    }
  };

  // Accounts created before multi-device access existed need it saved once, from a browser that can already sign.
  const enrollDeviceFactor = async (deviceCode: string) => {
    const address = walletAddress.current || storedUser()?.walletAddress || '';
    if (!isStellarAddress(address)) throw new Error('Todavía no encontramos tu wallet. Recargá la página e intentá de nuevo.');
    const wallet = await connectSigningWallet(cavosAppId, address);
    await wallet.setupRecovery(deviceCode);
    updateStoredUser({ deviceFactorAt: Date.now() });
    $deviceEnrollmentOffered.set(false);
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
    const account = storedUser();
    showMessage('Habilitando tu cuenta para otros dispositivos...', 'info');
    try {
      if (!account || !(await verifyPassword(account, password))) throw new Error('Esa no es la contraseña de tu cuenta en este navegador.');
      await enrollDeviceFactor(await deviceCodeFor(account.email, password));
      $deviceFormOpen.set(false);
      showMessage('Listo: ya podés entrar desde el celular con tu correo y tu contraseña.', 'success');
    } catch (error) {
      showMessage(errorMessage(error), 'error');
    }
  };

  const applyScannedText = (text: string) => {
    const { claim, publicToken } = parseScannedQr(text);
    setScannedClaim(claim);
    if (claim) {
      showMessage(DETECTED_MESSAGE, 'success');
      return;
    }
    showMessage(publicToken
      ? 'Ese es el QR público del producto: sirve para verificarlo. Para activar la garantía escaneá el QR de la etiqueta interna.'
      : 'No reconocimos ese QR como un QR de Verifire.', 'error');
  };

  const handleClaim = async (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!scannedClaim) {
      showMessage('Primero escaneá el QR de la etiqueta interna del producto.', 'error');
      return;
    }

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
        updateStoredUser({ emailVerifiedAt: 0 });
        keepPendingClaim(scannedClaim);
        leaveSession('verificar');
        return;
      }
      // A QR that does not exist or was already used will not work on a retry.
      if (error instanceof ApiError && error.status < 500 && !error.retryable) setScannedClaim(null);
      showMessage(errorMessage(error), 'error');
    } finally {
      setClaiming(false);
    }
  };

  useEffect(() => {
    // Without a session the page's guard is already sending the user to the login page.
    if (!userSession.isActive()) return;

    captureClaimLink();
    const pendingClaim = takePendingClaim();
    if (pendingClaim === 'invalid') {
      showMessage('No pudimos leer ese QR. Escanealo de nuevo.', 'error');
    } else if (pendingClaim) {
      setScannedClaim(pendingClaim);
      showMessage(DETECTED_MESSAGE, 'success');
    }

    void loadWarranties().then(enableOtherDevices);
    // Runs once per page load.
  }, []);

  return (
    <>
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
        <form id="claim-form" noValidate hidden={!scannedClaim} onSubmit={(event) => void handleClaim(event)}>
          <button ref={claimButtonRef} className="button button-primary" type="submit" disabled={claiming}>Activar Garantía Oficial</button>
        </form>
        {deviceFormOpen && (
          <DeviceEnrollForm onEnroll={enrollWithPassword} onCancel={() => $deviceFormOpen.set(false)} />
        )}
      </section>

      <WarrantyVault warranties={warranties} status={vaultStatus} />
    </>
  );
}
