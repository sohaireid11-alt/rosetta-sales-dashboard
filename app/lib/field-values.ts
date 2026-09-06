export type StoredChoice = string;

/**
 * Multiselect storage (same TEXT column as historical single values):
 * - "" or null → no values
 * - "Scheduled Interpretation" → one historical or current single value
 * - '["Call","Email"]' → two or more values as a JSON string array
 * A single selected value is always stored as a plain string so older rows
 * and CSV exports stay readable. Validation accepts both shapes.
 */
export function parseStoredValues(raw: unknown): string[] {
  if (raw === null || raw === undefined) return [];
  if (Array.isArray(raw)) {
    return uniqueChoices(raw.map((value) => (typeof value === "string" ? value.trim() : "")).filter(Boolean));
  }
  if (typeof raw !== "string") return [];
  const text = raw.trim();
  if (!text) return [];
  if (text.startsWith("[")) {
    try {
      const parsed = JSON.parse(text) as unknown;
      if (Array.isArray(parsed)) {
        return uniqueChoices(parsed.map((value) => (typeof value === "string" ? value.trim() : "")).filter(Boolean));
      }
    } catch {
      return [text];
    }
  }
  if (text.includes(";") && !text.startsWith("[")) {
    const parts = text.split(";").map((part) => part.trim()).filter(Boolean);
    if (parts.length > 1) return uniqueChoices(parts);
  }
  return [text];
}

export function serializeStoredValues(values: unknown, allowMultiple = true): string {
  const parsed = parseStoredValues(values);
  if (!parsed.length) return "";
  if (!allowMultiple || parsed.length === 1) return parsed[0];
  return JSON.stringify(parsed);
}

export function includesChoice(raw: unknown, choice: string) {
  return parseStoredValues(raw).includes(choice);
}

export function formValueForType(raw: unknown, inputType: string): string | string[] {
  const values = parseStoredValues(raw);
  if (inputType === "multiselect") return values;
  if (inputType === "checkbox") return values[0] === "true" ? "true" : "";
  return values[0] ?? "";
}

export function displayChoices(raw: unknown, labelForValue: (value: string) => string, empty = "") {
  const labels = parseStoredValues(raw).map((value) => labelForValue(value));
  return labels.length ? labels.join(", ") : empty;
}

function uniqueChoices(values: string[]) {
  const seen = new Set<string>();
  const next: string[] = [];
  for (const value of values) {
    const key = value.toLocaleLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    next.push(value);
  }
  return next;
}
