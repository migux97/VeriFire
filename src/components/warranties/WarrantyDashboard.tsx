// The buyer's panel: scan the secret QR inside a product, activate its warranty, list the warranties already owned and
// pass them on to a new owner through a transfer link, or accept one.
import { useEffect, useRef, useState, type SubmitEvent } from 'react';
import { Icon } from '@/components/ui/Icon';
import type { Message, MessageTone } from '@/components/ui/StatusMessage';
import { Toast } from '@/components/ui/Toast';
import { useNow } from '@/components/ui/useNow';
import { storedUser, updateStoredUser } from '@/lib/client/account';
import { activateWarranty } from '@/lib/client/activation';
import { ApiError, getJson } from '@/lib/client/api';
import { verifyPassword, deviceCodeFor } from '@/lib/client/password';
import {
  captureClaimLink, keepPendingClaim, keepPendingTransfer, takePendingClaim, takePendingTransfer
} from '@/lib/client/qr';
import { parseScannedQr, type ScannedClaim } from '@/lib/qr-codes';
import { leaveSession, userSession } from '@/lib/client/session';
import {
  acceptTransfer, cancelTransfer, offerTransfer, readTransferLink, savedTransferLink, type IncomingTransfer
} from '@/lib/client/transfer';
import { DeviceNotReadyError, EmailCodeRequiredError, enableSigning, hasDeviceFactor, resolveWalletAddress, storedDeviceCode } from '@/lib/client/wallet';
import { errorMessage } from '@/lib/errors';
import { formatCountdown } from '@/lib/format';
import type { TransferredWarranty, Warranty, WarrantiesResponse } from '@/lib/types';
import { isStellarAddress } from '@/lib/validation';
import { DeviceEnrollForm } from './DeviceEnrollForm';
import { QrScanPanel } from './QrScanPanel';
import { WarrantyVault, type TransferControls } from './WarrantyVault';
import { fillIn, getConsumerMessages, type ConsumerLocale } from '@/i18n/consumer';

// While a transfer link is open, the list is checked this often, so the owner sees when someone accepts it.
const TRANSFER_POLL_MS = 8000;

interface WarrantyDashboardProps {
  cavosAppId: string;
  locale?: ConsumerLocale;
}

export function WarrantyDashboard({ cavosAppId, locale = 'es' }: WarrantyDashboardProps) {
  const labels = getConsumerMessages(locale);
  const { claim: claimCopy, incoming: incomingCopy, card, device } = labels;
  const [message, setMessage] = useState<Message | null>(null);
  const [scannedClaim, setScannedClaim] = useState<ScannedClaim | null>(null);
  const [claiming, setClaiming] = useState(false);
  const [warranties, setWarranties] = useState<Warranty[] | null>(null);
  const [transferred, setTransferred] = useState<TransferredWarranty[]>([]);
  const [vaultStatus, setVaultStatus] = useState<string | null>(claimCopy.loading);
  const [incoming, setIncoming] = useState<{ secret: string; transfer: IncomingTransfer } | null>(null);
  const [accepting, setAccepting] = useState(false);
  const [transferLinks, setTransferLinks] = useState<Record<string, string>>({});
  const [busyToken, setBusyToken] = useState<string | null>(null);
  const [transferStatuses, setTransferStatuses] = useState<Record<string, Message>>({});
  // What failed because this browser could not sign yet: "Reintentar" enables it and runs it again.
  const [repair, setRepair] = useState<{ run: () => Promise<void> } | null>(null);
  const [repairing, setRepairing] = useState(false);
  const now = useNow(incoming !== null);
  const incomingExpired = incoming !== null && new Date(incoming.transfer.expiresAt).getTime() <= now;
  const walletAddress = useRef('');
  // Answers of loads started before the last change to the list are stale: a slow poll must not undo what an action
  // (a link just opened, a warranty just activated) already wrote on screen.
  const loadRequest = useRef(0);
  const claimButtonRef = useRef<HTMLButtonElement>(null);

  const showMessage = (text: string, tone: MessageTone) => setMessage({ text, tone });

  useEffect(() => {
    if (scannedClaim) claimButtonRef.current?.focus();
  }, [scannedClaim]);

  // quiet: a background check, which neither shows "Cargando" nor replaces the list with an error.
  const loadWarranties = async ({ quiet = false } = {}) => {
    if (!quiet) setVaultStatus(claimCopy.loading);
    const request = ++loadRequest.current;
    try {
      walletAddress.current ||= await resolveWalletAddress(cavosAppId);
      const data = await getJson<WarrantiesResponse>(`/api/warranties?owner=${encodeURIComponent(walletAddress.current)}`, claimCopy.loadError);
      if (request !== loadRequest.current) return data;
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
      if (!quiet && request === loadRequest.current) setVaultStatus(errorMessage(error));
      return null;
    }
  };

  // What is on screen is newer than any load in flight.
  const listChanged = () => { loadRequest.current += 1; };

  // An open link is accepted in someone else's browser: check until it happens and tell the owner right away.
  const openOffers = warranties?.filter((warranty) => warranty.transferExpiresAt).map((warranty) => warranty.token).join(',') ?? '';
  useEffect(() => {
    if (!openOffers) return undefined;
    const tokens = openOffers.split(',');
    const timer = window.setInterval(async () => {
      const data = await loadWarranties({ quiet: true });
      const given = data?.transferred.find((product) => tokens.includes(product.token));
      if (given) showMessage(fillIn(incomingCopy.given, { model: given.model, to: given.to }), 'success');
    }, TRANSFER_POLL_MS);
    return () => window.clearInterval(timer);
  }, [openOffers]);

  // Enables this browser to sign and saves the account's key in Stellar, so every other device can sign too.
  const enrollDeviceFactor = async (deviceCode: string) => {
    const address = walletAddress.current || storedUser()?.walletAddress || '';
    if (!isStellarAddress(address)) throw new Error(device.noWallet);
    await enableSigning(cavosAppId, address, deviceCode);
  };

  // The key is derived from the password this account uses in this browser.
  const deviceCodeFromPassword = async (password: string) => {
    const account = storedUser();
    if (!account || !(await verifyPassword(account, password))) throw new Error(device.wrongPassword);
    return deviceCodeFor(account.email, password);
  };

  // Offers "Reintentar" when the error is one this browser can fix with the password.
  const offerRepair = (error: unknown, run: () => Promise<void>) => {
    if (error instanceof DeviceNotReadyError && error.canRetry) setRepair({ run });
  };

  const repairAndRetry = async (password?: string) => {
    if (!repair) return;
    setRepairing(true);
    showMessage(device.working, 'info');
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

  // An account that never saved its key in Stellar saves it by itself when the login left the password's key in this
  // tab; otherwise "Reintentar" does it the first time a signature fails.
  const enableOtherDevices = async () => {
    const address = walletAddress.current || storedUser()?.walletAddress || '';
    const deviceCode = storedDeviceCode();
    if (!deviceCode || !isStellarAddress(address) || await hasDeviceFactor(address) !== false) return;
    try {
      await enrollDeviceFactor(deviceCode);
    } catch (error) {
      console.warn('No se pudo guardar la llave de la cuenta en Stellar:', errorMessage(error));
    }
  };

  // The wallet cannot be reconnected without confirming the email again: ask for a code at login and come back.
  const leaveForEmailCode = () => {
    updateStoredUser({ emailVerifiedAt: 0 });
    leaveSession('verificar');
  };

  const ownerAddress = async () => (walletAddress.current ||= await resolveWalletAddress(cavosAppId));

  // A transfer link opened or scanned: show what it offers before accepting.
  const openTransferLink = async (secret: string) => {
    setIncoming(null);
    showMessage(incomingCopy.reading, 'info');
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
      showMessage(fillIn(incomingCopy.accepted, { model: warranty.model }), 'success');
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
      listChanged();
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
    }, card.linkReady),
    onCancel: (token) => {
      if (!window.confirm(card.confirmCancel)) return;
      void runTransfer(token, async (owner, onProgress) => {
        const warranty = await cancelTransfer(cavosAppId, token, owner, onProgress);
        setTransferLinks(({ [token]: _closed, ...rest }) => rest);
        return warranty;
      }, card.linkCancelled);
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
      showMessage(claimCopy.detected, 'success');
      return;
    }
    showMessage(publicToken ? claimCopy.publicQr : claimCopy.unknownQr, 'error');
  };

  const handleClaim = (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!scannedClaim) {
      showMessage(claimCopy.scanFirst, 'error');
      return;
    }
    void claim(scannedClaim);
  };

  const claim = async (scannedClaim: ScannedClaim) => {
    setRepair(null);
    setClaiming(true);
    showMessage(claimCopy.working, 'info');
    try {
      const owner = walletAddress.current || await resolveWalletAddress(cavosAppId);
      const product = await activateWarranty(cavosAppId, scannedClaim, owner, (progress) => showMessage(progress, 'info'));
      setScannedClaim(null);
      showMessage(fillIn(product.certificateUrl ? claimCopy.doneOnChain : claimCopy.done, { model: product.model }), 'success');
      await loadWarranties();
    } catch (error) {
      // The wallet cannot be reconnected without confirming the email again: keep the QR and ask for a code at login.
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
      showMessage(claimCopy.unreadableQr, 'error');
    } else if (pendingClaim) {
      setScannedClaim(pendingClaim);
      showMessage(claimCopy.detected, 'success');
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
            <span className="eyebrow">{incomingCopy.eyebrow}</span>
            <h2 id="transfer-title">{incomingCopy.title}</h2>
          </div>
          <dl className="transfer-summary">
            <div><dt>{incomingCopy.product}</dt><dd>{incoming.transfer.model}</dd></div>
            <div><dt>{incomingCopy.code}</dt><dd>{incoming.transfer.token}</dd></div>
            <div><dt>{incomingCopy.owner}</dt><dd>{incoming.transfer.from}</dd></div>
          </dl>
          <p className="claim-hint">{incomingCopy.note}</p>
          <p className="transfer-countdown" role="timer">
            <Icon name="fa-regular fa-clock" />
            {incomingExpired
              ? ` ${incomingCopy.expired}`
              : <> {incomingCopy.expiresIn} <strong>{formatCountdown(incoming.transfer.expiresAt, now)}</strong></>}
          </p>
          <div className="scan-actions">
            <button className="button button-primary" type="button" disabled={accepting || incomingExpired} onClick={() => void handleAcceptTransfer()}>
              {incomingCopy.accept}
            </button>
            <button className="button button-secondary" type="button" disabled={accepting} onClick={() => setIncoming(null)}>{incomingCopy.discard}</button>
          </div>
        </section>
      )}

      <section className="claim-card" aria-labelledby="claim-title">
        <div>
          <span className="eyebrow">{claimCopy.eyebrow}</span>
          <h1 id="claim-title">{claimCopy.title}</h1>
        </div>
        <p className="claim-hint">
          {claimCopy.hint} <kbd>Ctrl</kbd> + <kbd>V</kbd>. {claimCopy.onceHint}
        </p>
        <QrScanPanel
          locale={locale}
          disabled={claiming}
          onDetected={applyScannedText}
          onMessage={setMessage}
          onScanStart={() => setScannedClaim(null)}
        />
        <Toast message={message} onClose={() => setMessage(null)} />
        {repair && (storedDeviceCode()
          ? (
            <div className="repair-prompt">
              <p>{device.prompt}</p>
              <button className="button button-primary" type="button" disabled={repairing} onClick={() => void repairAndRetry()}>
                <Icon name="fa-solid fa-rotate-right" /> {device.retry}
              </button>
            </div>
          )
          : (
            <DeviceEnrollForm
              submitLabel={device.retry}
              hint={device.hint}
              labels={device}
              onEnroll={repairAndRetry}
              onCancel={() => setRepair(null)}
            />
          ))}
        <form id="claim-form" noValidate hidden={!scannedClaim} onSubmit={handleClaim}>
          <button ref={claimButtonRef} className="button button-primary" type="submit" disabled={claiming}>{claimCopy.activate}</button>
        </form>
      </section>

      <WarrantyVault warranties={warranties} status={vaultStatus} transfers={transfers} transferred={transferred} locale={locale} />
    </>
  );
}
