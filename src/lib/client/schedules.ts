// The company's agenda of batches and payments: reminders kept in this browser, per account. They do not execute
// payments or create tokens; the notifications (notifications.ts) read them to warn before each date.
import { readAccountData, writeAccountData } from './account-data';

export type ScheduleType = 'batch' | 'payment';

export interface ScheduleItem {
  id: string;
  type: ScheduleType;
  title: string;
  detail: string;
  // Local date and time as the form's datetime-local gives it, e.g. "2026-09-30T10:00".
  date: string;
}

export const SCHEDULES_CHANGED_EVENT = 'company-schedules-changed';

const isScheduleItem = (item: unknown): item is ScheduleItem => {
  const entry = item as Partial<ScheduleItem> | null;
  return (
    Boolean(entry) &&
    typeof entry?.id === 'string' &&
    !entry.id.startsWith('sample-') &&
    (entry.type === 'batch' || entry.type === 'payment') &&
    typeof entry.title === 'string' &&
    typeof entry.detail === 'string' &&
    typeof entry.date === 'string' &&
    Number.isFinite(Date.parse(entry.date))
  );
};

export const readSchedules = (): ScheduleItem[] => {
  const saved = readAccountData<unknown>('company-schedules', 'verifire-company-schedules');
  return Array.isArray(saved) ? saved.filter(isScheduleItem) : [];
};

// False when the browser would not store it.
export const writeSchedules = (items: ScheduleItem[]) => {
  if (!writeAccountData('company-schedules', items)) return false;
  window.dispatchEvent(new Event(SCHEDULES_CHANGED_EVENT));
  return true;
};
