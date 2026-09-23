// The browser's storage, which is not always there: private windows, blocked site data and a full quota all make it
// throw. Every read answers null and every write is dropped instead of breaking the page that called it.
export const readRaw = (storage: Storage, key: string): string | null => {
  try {
    return storage.getItem(key);
  } catch {
    return null;
  }
};

export const writeRaw = (storage: Storage, key: string, value: string): boolean => {
  try {
    storage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
};

export const removeStored = (storage: Storage, key: string) => {
  try {
    storage.removeItem(key);
  } catch {
    // Nothing was stored in the first place.
  }
};

// JSON kept in localStorage or sessionStorage. A missing, corrupt or unreadable entry reads as null.
export const readStored = <T>(storage: Storage, key: string): T | null => {
  try {
    const raw = readRaw(storage, key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
};

export const writeStored = (storage: Storage, key: string, value: unknown) => writeRaw(storage, key, JSON.stringify(value));

// Keys of a storage, empty when it cannot be read.
export const storedKeys = (storage: Storage): string[] => {
  try {
    return Array.from({ length: storage.length }, (_, index) => storage.key(index)).filter((key): key is string => key !== null);
  } catch {
    return [];
  }
};
