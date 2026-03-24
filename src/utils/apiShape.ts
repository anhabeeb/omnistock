export const asArray = <T>(value: unknown): T[] => (
  Array.isArray(value) ? value as T[] : []
);

export const asObject = <T extends Record<string, unknown>>(value: unknown, fallback: T): T => (
  value && typeof value === 'object' && !Array.isArray(value)
    ? { ...fallback, ...(value as Partial<T>) }
    : fallback
);
