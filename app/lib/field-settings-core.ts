import {
  DEFAULT_UI_LABELS,
  FIELD_LIST_DEFAULTS,
  FIELD_LIST_KEYS,
  UI_LABEL_KEYS,
  type FieldListKey,
  type UiLabelKey,
} from "../sales-config";

export type FieldOption = {
  id: number;
  value: string;
  label: string;
  sortOrder: number;
  isActive: boolean;
};

export type FieldLists = Record<FieldListKey, FieldOption[]>;
export type UiLabels = Record<UiLabelKey, string>;
export type FieldSettings = { lists: FieldLists; labels: UiLabels };
export type NormalizedFieldOption = { value: string; label: string; sortOrder: number; isActive: boolean };

export class FieldSettingsError extends Error {
  readonly status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

export function seedOptions(values: readonly string[]): FieldOption[] {
  return values.map((value, index) => ({
    id: index + 1,
    value,
    label: value,
    sortOrder: index,
    isActive: true,
  }));
}

export function defaultFieldLists(): FieldLists {
  return Object.fromEntries(
    FIELD_LIST_KEYS.map((key) => [key, seedOptions(FIELD_LIST_DEFAULTS[key])])
  ) as FieldLists;
}

export function defaultFieldSettings(): FieldSettings {
  return { lists: defaultFieldLists(), labels: { ...DEFAULT_UI_LABELS } };
}

export function emptyFieldLists(): FieldLists {
  return Object.fromEntries(FIELD_LIST_KEYS.map((key) => [key, []])) as FieldLists;
}

export function isFieldListKey(value: unknown): value is FieldListKey {
  return typeof value === "string" && (FIELD_LIST_KEYS as readonly string[]).includes(value);
}

export function mergeLabels(value: unknown): UiLabels {
  const source = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  const labels = { ...DEFAULT_UI_LABELS };
  for (const key of UI_LABEL_KEYS) {
    const next = source[key];
    if (typeof next === "string" && next.trim()) labels[key] = next.trim();
  }
  return labels;
}

export function parseStoredLabels(raw: string | null | undefined): UiLabels {
  if (!raw) return { ...DEFAULT_UI_LABELS };
  try {
    return mergeLabels(JSON.parse(raw) as unknown);
  } catch {
    return { ...DEFAULT_UI_LABELS };
  }
}

export function optionValues(options: FieldOption[]): string[] {
  return options.map((option) => option.value);
}

export function labelFor(options: FieldOption[] | undefined, value: string) {
  return options?.find((option) => option.value === value)?.label ?? value;
}

export function firstActiveValue(options: FieldOption[] | undefined, fallback: string) {
  return options?.find((option) => option.isActive)?.value ?? fallback;
}

export function visibleOptions(options: FieldOption[] | undefined, currentValue?: string) {
  const list = options ?? [];
  const active = list.filter((option) => option.isActive);
  if (!currentValue || active.some((option) => option.value === currentValue)) return active;
  const retired = list.find((option) => option.value === currentValue);
  return retired ? [...active, retired] : [...active, {
    id: 0,
    value: currentValue,
    label: currentValue,
    sortOrder: active.length,
    isActive: false,
  }];
}

export function normalizeListUpdate(listKey: unknown, options: unknown) {
  if (!isFieldListKey(listKey)) throw new FieldSettingsError("Choose a valid field list.");
  if (!Array.isArray(options) || options.length === 0) throw new FieldSettingsError("Add at least one option.");

  const seen = new Set<string>();
  const normalized: NormalizedFieldOption[] = options.map((option, index) => {
    if (!option || typeof option !== "object") throw new FieldSettingsError("Each option needs a label.");
    const data = option as Record<string, unknown>;
    const label = typeof data.label === "string" ? data.label.trim() : "";
    if (!label) throw new FieldSettingsError("Each option needs a label.");
    if (label.length > 120) throw new FieldSettingsError("Option labels must be 120 characters or fewer.");
    const value = (typeof data.value === "string" ? data.value.trim() : "") || label;
    if (!value) throw new FieldSettingsError("Each option needs a stored value.");
    if (value.length > 120) throw new FieldSettingsError("Option values must be 120 characters or fewer.");
    const key = value.toLocaleLowerCase();
    if (seen.has(key)) throw new FieldSettingsError(`"${label}" is already on this list.`);
    seen.add(key);
    return { value, label, sortOrder: index, isActive: data.isActive !== false };
  });

  if (!normalized.some((option) => option.isActive)) {
    throw new FieldSettingsError("Keep at least one option in the dropdown. Hide unused choices instead of removing every option.");
  }

  return { listKey, options: normalized };
}

export function mergeListOptions(existing: FieldOption[], incoming: NormalizedFieldOption[]) {
  const incomingByValue = new Map(incoming.map((option) => [option.value.toLocaleLowerCase(), option]));
  const existingByValue = new Map(existing.map((option) => [option.value.toLocaleLowerCase(), option]));
  const next: NormalizedFieldOption[] = incoming.map((option) => {
    const current = existingByValue.get(option.value.toLocaleLowerCase());
    return {
      value: current?.value ?? option.value,
      label: option.label,
      sortOrder: option.sortOrder,
      isActive: option.isActive,
    };
  });

  for (const current of existing) {
    if (incomingByValue.has(current.value.toLocaleLowerCase())) continue;
    next.push({
      value: current.value,
      label: current.label,
      sortOrder: next.length,
      isActive: false,
    });
  }

  return next;
}

export function normalizeLabelsUpdate(value: unknown) {
  if (!value || typeof value !== "object") throw new FieldSettingsError("Display labels are required.");
  const data = value as Record<string, unknown>;
  const labels = { ...DEFAULT_UI_LABELS };
  for (const key of UI_LABEL_KEYS) {
    if (!(key in data)) continue;
    const next = typeof data[key] === "string" ? data[key].trim() : "";
    if (!next) throw new FieldSettingsError(`${DEFAULT_UI_LABELS[key]} cannot be empty.`);
    if (next.length > 80) throw new FieldSettingsError("Labels must be 80 characters or fewer.");
    labels[key] = next;
  }
  return labels;
}
