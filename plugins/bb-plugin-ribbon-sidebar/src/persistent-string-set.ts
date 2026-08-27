import {
  useCallback,
  useEffect,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";

export function parseStoredStringSet(raw: string | null): Set<string> {
  if (raw === null) return new Set();
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return new Set();
    return new Set(
      parsed.filter((value): value is string => typeof value === "string"),
    );
  } catch {
    return new Set();
  }
}

export function usePersistentStringSet(
  key: string,
): [Set<string>, Dispatch<SetStateAction<Set<string>>>] {
  const [values, setValues] = useState(() => {
    try {
      return parseStoredStringSet(window.localStorage.getItem(key));
    } catch {
      return new Set<string>();
    }
  });

  useEffect(() => {
    function onStorage(event: StorageEvent) {
      if (event.key === key) setValues(parseStoredStringSet(event.newValue));
    }
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [key]);

  const setPersistentValues = useCallback<
    Dispatch<SetStateAction<Set<string>>>
  >(
    (nextValue) => {
      setValues((current) => {
        const next =
          typeof nextValue === "function" ? nextValue(current) : nextValue;
        try {
          window.localStorage.setItem(key, JSON.stringify([...next]));
        } catch {
          // Keep collapse working for this mount when storage is unavailable.
        }
        return next;
      });
    },
    [key],
  );

  return [values, setPersistentValues];
}
