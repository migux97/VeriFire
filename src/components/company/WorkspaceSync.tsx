import { useEffect, useRef } from 'react';
import { ACCOUNT_DATA_WRITTEN_EVENT, accountDataSnapshot, applyAccountData } from '@/lib/client/account-data';
import { demoModeActive } from '@/lib/client/session';
import { storedUser, updateStoredUser } from '@/lib/client/account';
import { addPurchaseIds, forgottenPurchaseIds, PURCHASES_CHANGED_EVENT, savedPurchaseIds } from '@/lib/client/purchases';
import { userSession } from '@/lib/client/session';
import { companyMemberships } from '@/lib/client/workspace';
import { resolveWalletAddress } from '@/lib/client/wallet';
import { syncWorkspace } from '@/lib/client/workspace-sync';
import { errorMessage } from '@/lib/errors';

// Keeps the company side of an account with its wallet instead of with one browser: signing in somewhere else finds
// the same batches and the same kind of account. It draws nothing; the panels read what it leaves in this browser.
export function WorkspaceSync({ cavosAppId }: { cavosAppId: string }) {
  const running = useRef(false);
  // Something changed while a sync was running: one more round when it ends, so the change is not left behind.
  const again = useRef(false);

  useEffect(() => {
    if (!userSession.isActive()) return undefined;

    const sync = async () => {
      // The demo's sample data (its agenda, its batches) must never replace the account's real data on the server.
      if (demoModeActive()) return;
      // One at a time: the list of purchases is merged on the server, so a second call would only repeat the work.
      if (running.current) {
        again.current = true;
        return;
      }
      running.current = true;
      try {
        const owner = await resolveWalletAddress(cavosAppId);
        const account = storedUser();
        // Only a company of its own makes the account a business one: a member of someone else's team would otherwise
        // come back everywhere as the admin of an empty company, losing the team it joined.
        const company = account?.accountType === 'business';
        const remote = await syncWorkspace(cavosAppId, owner, {
          purchaseIds: savedPurchaseIds(),
          // Removed from the list here: the server stops listing them, so the next sync does not bring them back.
          removedPurchaseIds: forgottenPurchaseIds(),
          // The team, the agenda, the templates and the profile: whatever is newer wins, in both directions.
          data: accountDataSnapshot(),
          ...(company ? { accountType: 'business' as const } : {}),
          ...(account?.companyName ? { companyName: account.companyName } : {})
        });
        addPurchaseIds(remote.purchaseIds);
        applyAccountData(remote.data);
        // A company account stays a company account on every device. A member of another company's team is not made
        // one: earlier versions sent "business" for members too, and the server may still hold that.
        const member = !company && Boolean(account && companyMemberships(account.email).length);
        updateStoredUser({
          ...(remote.accountType && !member ? { accountType: remote.accountType } : {}),
          ...(remote.companyName ? { companyName: remote.companyName } : {})
        });
      } catch (error) {
        // The panel keeps working with what this browser knows; signing needs the Gmail confirmed again.
        console.warn('No se pudo sincronizar la cuenta de empresa:', errorMessage(error));
      } finally {
        running.current = false;
        if (again.current) {
          again.current = false;
          void sync();
        }
      }
    };

    const onPurchasesChanged = () => void sync();
    // A template, the team, the profile...: sent a moment after the last change, so a burst of edits is one sync.
    // The demo's data stays in this browser.
    let savedTimer: number | undefined;
    const onDataWritten = () => {
      if (demoModeActive()) return;
      window.clearTimeout(savedTimer);
      savedTimer = window.setTimeout(() => void sync(), 1500);
    };
    void sync();
    window.addEventListener(PURCHASES_CHANGED_EVENT, onPurchasesChanged);
    window.addEventListener(ACCOUNT_DATA_WRITTEN_EVENT, onDataWritten);
    return () => {
      window.clearTimeout(savedTimer);
      window.removeEventListener(PURCHASES_CHANGED_EVENT, onPurchasesChanged);
      window.removeEventListener(ACCOUNT_DATA_WRITTEN_EVENT, onDataWritten);
    };
  }, [cavosAppId]);

  return null;
}
