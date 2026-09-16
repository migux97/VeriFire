// JSON kept in localStorage or sessionStorage. A missing, corrupt or unreadable entry reads as null.
export const readStored = <T>(storage: Storage, key: string): T | null => {
  try {
    const raw = storage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
};

export const writeStored = (storage: Storage, key: string, value: unknown) => {
  storage.setItem(key, JSON.stringify(value));
};
