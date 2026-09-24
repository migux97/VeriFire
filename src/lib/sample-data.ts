// The panel used to have a demo mode that filled the account with invented entries (an agenda, team members...). A bug
// synced some of them to the account as if they were real. They are recognised by the ids and addresses the demo
// gave them and dropped wherever the account's data is read, so only real data is ever shown or kept.
export const isSampleEntry = (entry: unknown) => {
  if (!entry || typeof entry !== 'object') return false;
  const { id, email } = entry as { id?: unknown; email?: unknown };
  // Its own entries (demo-..., demo:...) and the reminders its agenda produced (reminder:demo-...).
  return (typeof id === 'string' && /^(reminder:)?demo[-:]/i.test(id)) || (typeof email === 'string' && /@demo\.verifire$/i.test(email));
};

// The list without the sample entries, or null when it had none (nothing to rewrite).
export const withoutSampleEntries = (value: unknown): unknown[] | null => {
  if (!Array.isArray(value) || !value.some(isSampleEntry)) return null;
  return value.filter((entry) => !isSampleEntry(entry));
};
