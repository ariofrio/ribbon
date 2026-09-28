const ALPHABET =
  "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
const DIGITS = new Map([...ALPHABET].map((digit, index) => [digit, index]));

function digit(key: string, index: number, fallback: number): number {
  if (index >= key.length) return fallback;
  const value = DIGITS.get(key[index] ?? "");
  if (value === undefined) throw new Error("Invalid order key digit.");
  return value;
}

function assertKey(key: string): void {
  if (key.length === 0) throw new Error("Order key cannot be empty.");
  for (const value of key) {
    if (!DIGITS.has(value)) throw new Error("Invalid order key digit.");
  }
}

/** The same base-62 fractional indexing scheme bb uses for pinned threads. */
export function createOrderKeyBetween(
  previousKey: string | null,
  nextKey: string | null,
): string {
  if (previousKey !== null) assertKey(previousKey);
  if (nextKey !== null) assertKey(nextKey);
  if (previousKey !== null && nextKey !== null && previousKey >= nextKey) {
    throw new Error("Previous order key must sort before next order key.");
  }
  let prefix = "";
  let index = 0;
  while (true) {
    const previous =
      previousKey === null ? 0 : digit(previousKey, index, 0);
    const next =
      nextKey === null ? ALPHABET.length - 1 : digit(nextKey, index, ALPHABET.length - 1);
    if (next - previous > 1) {
      const candidate = `${prefix}${ALPHABET[Math.floor((previous + next) / 2)]}`;
      if (
        candidate === undefined ||
        (previousKey !== null && candidate <= previousKey) ||
        (nextKey !== null && candidate >= nextKey)
      ) {
        throw new Error("Could not create an order key between the anchors.");
      }
      return candidate;
    }
    const nextPrefix = ALPHABET[previous];
    if (nextPrefix === undefined) throw new Error("Invalid order key boundary.");
    prefix += nextPrefix;
    index += 1;
  }
}
