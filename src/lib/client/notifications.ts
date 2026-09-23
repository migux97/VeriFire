// Notifications of the company panel: a confirmed payment, a created batch, and the dates of the agenda coming up.
// Kept in this browser per account (inside the demo data while demo mode is on). A notice stores its kind and its
// values, not its text, so it reads in whatever language the panel is in when it is shown.
import { readAccountData, writeAccountData } from './account-data';
import { atom } from 'nanostores';
import { accountKey, userSession } from './session';
import { readSchedules } from './schedules';
import { readStored, writeStored } from './storage';

export type NoticeKind =
  | 'paymentSucceeded'
  | 'batchCreated'
  | 'paymentSoon'
  | 'paymentDue'
  | 'batchSoon'
  | 'batchDue'
  | 'teamInvite'
  | 'inviteAccepted'
  | 'inviteDeclined'
  | 'demo'
  | 'test';

export interface Notice {
  // Also what keeps a notice from repeating: the same event always gets the same id.
  id: string;
  kind: NoticeKind;
  params: Record<string, string>;
  at: string;
  read: boolean;
  // Where clicking it leads: a view of the panel ("#batches") or another page ("/invite#t=...").
  href?: string;
}

export type LeadHours = 1 | 24 | 72;

export interface NotificationPrefs {
  payments: boolean;
  batches: boolean;
  reminders: boolean;
  leadHours: LeadHours;
  browser: boolean;
}

export const defaultPrefs: NotificationPrefs = { payments: true, batches: true, reminders: true, leadHours: 24, browser: false };

const MAX_NOTICES = 60;
// Ids already notified, so a notice the user cleared does not come back on the next check.
const MAX_LOG = 400;
// A date that passed longer ago than this is not announced as due anymore.
const DUE_WINDOW_MS = 3 * 24 * 60 * 60 * 1000;

const noticesKey = () => accountKey('notifications');
const logKey = () => accountKey('notification-log');
// The preferences are the person's, not the demo's: they are kept outside the demo data.

export const $notices = atom<Notice[]>([]);
// Notices that arrived while the page is open, shown for a few seconds as a toast.
export const $freshNotices = atom<Notice[]>([]);

const isNotice = (value: unknown): value is Notice => {
  const notice = value as Partial<Notice> | null;
  return Boolean(notice) && typeof notice?.id === 'string' && typeof notice.kind === 'string' && typeof notice.at === 'string';
};

const readNotices = () => {
  const saved = readStored<unknown>(localStorage, noticesKey());
  return Array.isArray(saved) ? saved.filter(isNotice) : [];
};

const saveNotices = (notices: Notice[]) => {
  writeStored(localStorage, noticesKey(), notices);
  $notices.set(notices);
};

export const loadNotices = () => $notices.set(readNotices());

export const readPrefs = (): NotificationPrefs => ({ ...defaultPrefs, ...(readAccountData<Partial<NotificationPrefs>>('notification-prefs') ?? {}) });

export const savePrefs = (prefs: NotificationPrefs) => writeAccountData('notification-prefs', prefs);

const allowed = (kind: NoticeKind, prefs: NotificationPrefs) => {
  if (kind === 'paymentSucceeded') return prefs.payments;
  if (kind === 'batchCreated') return prefs.batches;
  if (kind === 'paymentSoon' || kind === 'paymentDue' || kind === 'batchSoon' || kind === 'batchDue') return prefs.reminders;
  return true;
};

// The browser's own notification, for when the tab is in the background. Its text comes from the component that
// renders notices (see CompanyNotifications), which registers itself here with the panel's language.
let describe: ((notice: Notice) => { title: string; body: string }) | null = null;
export const setNoticeDescriber = (describer: typeof describe) => {
  describe = describer;
};

const showInBrowser = (notice: Notice) => {
  if (!describe || typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
  try {
    const { title, body } = describe(notice);
    new Notification(title, { body, icon: '/favicon.png', tag: notice.id });
  } catch {
    // Some browsers only allow notifications from a service worker; the notice is still in the panel.
  }
};

export interface NewNotice {
  id: string;
  kind: NoticeKind;
  params?: Record<string, string>;
  href?: string;
  // Seeded notices are added as already read and without a toast.
  read?: boolean;
  at?: string;
  quiet?: boolean;
}

export const notify = ({ id, kind, params = {}, href, read = false, at, quiet = false }: NewNotice) => {
  if (!userSession.email()) return;
  const prefs = readPrefs();
  if (!allowed(kind, prefs)) return;
  const log = readStored<string[]>(localStorage, logKey()) ?? [];
  if (log.includes(id)) return;
  writeStored(localStorage, logKey(), [id, ...log].slice(0, MAX_LOG));
  const notice: Notice = { id, kind, params, at: at ?? new Date().toISOString(), read, ...(href ? { href } : {}) };
  saveNotices([notice, ...readNotices()].slice(0, MAX_NOTICES));
  if (quiet) return;
  $freshNotices.set([...$freshNotices.get(), notice]);
  if (prefs.browser && document.visibilityState !== 'visible') showInBrowser(notice);
};

export const dismissFresh = (id: string) => $freshNotices.set($freshNotices.get().filter((notice) => notice.id !== id));

export const markRead = (id: string) => saveNotices(readNotices().map((notice) => (notice.id === id ? { ...notice, read: true } : notice)));

export const markAllRead = () => saveNotices(readNotices().map((notice) => ({ ...notice, read: true })));

export const clearNotices = () => saveNotices([]);

// Announces the agenda's dates: once when a date enters the reminder window and once when it arrives. The date is
// kept as ISO in `params.date` and written out when the notice is shown.
export const checkReminders = (now = Date.now()) => {
  const { leadHours } = readPrefs();
  for (const item of readSchedules()) {
    const at = Date.parse(item.date);
    const payment = item.type === 'payment';
    const params = { title: item.title, date: new Date(at).toISOString() };
    if (at > now && at - now <= leadHours * 60 * 60 * 1000) {
      notify({ id: `reminder:${item.id}:soon`, kind: payment ? 'paymentSoon' : 'batchSoon', params, href: '#generate' });
    } else if (at <= now && now - at <= DUE_WINDOW_MS) {
      notify({ id: `reminder:${item.id}:due`, kind: payment ? 'paymentDue' : 'batchDue', params, href: '#generate' });
    }
  }
};
