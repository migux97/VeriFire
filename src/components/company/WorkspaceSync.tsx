import { useEffect, useRef } from 'react';
import { storedUser, updateStoredUser } from '@/lib/client/account';
import { companyMemberships } from '@/lib/client/workspace';
import { addPurchaseIds, PURCHASES_CHANGED_EVENT, savedPurchaseIds } from '@/lib/client/purchases';
import { userSession } from '@/lib/client/session';
import { resolveWalletAddress } from '@/lib/client/wallet';
import { syncWorkspace } from '@/lib/client/workspace-sync';
import { errorMessage } from '@/lib/errors';

// Keeps the company side of an account with its wallet instead of with one browser: signing in somewhere else finds
// the same batches and the same kind of account. It draws nothing; the panels read what it leaves in this browser.
export function WorkspaceSync({ cavosAppId }: { cavosAppId: string }) {
  const running = useRef(false);

  useEffect(() => {
    if (!userSession.isActive()) return undefined;

    const sync = async () => {
      // One at a time: the list of purchases is merged on the server, so a second call would only repeat the work.
      if (running.current) return;
      running.current = true;
      try {
        const owner = await resolveWalletAddress(cavosAppId);
        const account = storedUser();
        // Company access is either the kind of account or an invitation accepted in this browser; both make the
        // account a company one everywhere else.
        const company = account?.accountType === 'business' || Boolean(account && companyMemberships(account.email).length);
        const remote = await syncWorkspace(cavosAppId, owner, {
          purchaseIds: savedPurchaseIds(),
          ...(company ? { accountType: 'business' as const } : {}),
          ...(account?.companyName ? { companyName: account.companyName } : {})
        });
        addPurchaseIds(remote.purchaseIds);
        // A company account stays a company account on every device.
        updateStoredUser({
          ...(remote.accountType ? { accountType: remote.accountType } : {}),
          ...(remote.companyName ? { companyName: remote.companyName } : {})
        });
      } catch (error) {
        // The panel keeps working with what this browser knows; signing needs the Gmail confirmed again.
        console.warn('No se pudo sincronizar la cuenta de empresa:', errorMessage(error));
      } finally {
        running.current = false;
      }
    };

    const onPurchasesChanged = () => void sync();
    void sync();
    window.addEventListener(PURCHASES_CHANGED_EVENT, onPurchasesChanged);
    return () => window.removeEventListener(PURCHASES_CHANGED_EVENT, onPurchasesChanged);
  }, [cavosAppId]);

  return null;
}
