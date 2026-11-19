const REQUEST_KEY_MAX_LENGTH = 128;

export const parseRequestKey = (value: unknown): string | undefined => {
  const key = typeof value === "string" ? value.trim() : "";
  return key.length > 0 && key.length <= REQUEST_KEY_MAX_LENGTH
    ? key
    : undefined;
};
