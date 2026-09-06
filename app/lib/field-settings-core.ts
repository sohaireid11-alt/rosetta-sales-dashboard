import {
  DEFAULT_FIELD_DEFINITIONS,
  DEFAULT_FIELD_SECTIONS,
  DEFAULT_VIEW_COLUMNS,
  FIELD_ENTITIES,
  FIELD_INPUT_TYPES,
  FIELD_SECTION_KEYS,
  VIEW_KEYS,
  type FieldDefinition,
  type FieldEntity,
  type FieldInputType,
  type FieldSectionKey,
  type ViewColumn,
  type ViewKey,
} from "../admin-catalog";
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
export type FieldSections = Record<FieldSectionKey, string>;
export type FieldSettings = {
  lists: FieldLists;
  labels: UiLabels;
  fields: FieldDefinition[];
  views: Record<ViewKey, ViewColumn[]>;
  sections: FieldSections;
};
export type NormalizedFieldOption = { value: string; label: string; sortOrder: number; isActive: boolean };

export type {
  FieldDefinition,
  FieldEntity,
  FieldInputType,
  FieldSectionKey,
  ViewColumn,
  ViewKey,
};

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

export function defaultFieldSections(): FieldSections {
  return Object.fromEntries(
    FIELD_SECTION_KEYS.map((key) => [key, DEFAULT_FIELD_SECTIONS[key].title])
  ) as FieldSections;
}

export function defaultViewColumns(): Record<ViewKey, ViewColumn[]> {
  return Object.fromEntries(
    VIEW_KEYS.map((viewKey) => [
      viewKey,
      DEFAULT_VIEW_COLUMNS.filter((column) => column.viewKey === viewKey).map((column) => ({ ...column })),
    ])
  ) as Record<ViewKey, ViewColumn[]>;
}

export function defaultFieldSettings(): FieldSettings {
  return {
    lists: defaultFieldLists(),
    labels: { ...DEFAULT_UI_LABELS },
    fields: DEFAULT_FIELD_DEFINITIONS.map((field) => ({ ...field })),
    views: defaultViewColumns(),
    sections: defaultFieldSections(),
  };
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

export function visibleOptions(options: FieldOption[] | undefined, currentValue?: string | string[]) {
  const list = options ?? [];
  const active = list.filter((option) => option.isActive);
  const current = (Array.isArray(currentValue) ? currentValue : currentValue ? [currentValue] : [])
    .map((value) => value.trim())
    .filter(Boolean);
  const extras = current.filter((value) => !active.some((option) => option.value === value));
  if (!extras.length) return active;
  return [
    ...active,
    ...extras.map((value, index) => {
      const retired = list.find((option) => option.value === value);
      return retired ?? {
        id: 0,
        value,
        label: value,
        sortOrder: active.length + index,
        isActive: false,
      };
    }),
  ];
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
    if (next.length > 200) throw new FieldSettingsError("Labels must be 200 characters or fewer.");
    labels[key] = next;
  }
  return labels;
}

export function isFieldInputType(value: unknown): value is FieldInputType {
  return typeof value === "string" && (FIELD_INPUT_TYPES as readonly string[]).includes(value);
}

export function isFieldEntity(value: unknown): value is FieldEntity {
  return typeof value === "string" && (FIELD_ENTITIES as readonly string[]).includes(value);
}

export function isFieldSectionKey(value: unknown): value is FieldSectionKey {
  return typeof value === "string" && (FIELD_SECTION_KEYS as readonly string[]).includes(value);
}

export function isViewKey(value: unknown): value is ViewKey {
  return typeof value === "string" && (VIEW_KEYS as readonly string[]).includes(value);
}

export function normalizeFieldDefinitionUpdate(value: unknown, existing: FieldDefinition) {
  if (!value || typeof value !== "object") throw new FieldSettingsError("A field definition is required.");
  const data = value as Record<string, unknown>;
  const label = typeof data.label === "string" ? data.label.trim() : existing.label;
  if (!label) throw new FieldSettingsError("Each field needs a label.");
  if (label.length > 80) throw new FieldSettingsError("Field labels must be 80 characters or fewer.");
  const helpText = typeof data.helpText === "string" ? data.helpText.trim() : existing.helpText;
  if (helpText.length > 240) throw new FieldSettingsError("Help text must be 240 characters or fewer.");
  let inputType = existing.inputType;
  if (data.inputType !== undefined) {
    if (!isFieldInputType(data.inputType)) throw new FieldSettingsError("Choose a valid input type.");
    if (existing.typeLocked && data.inputType !== existing.inputType) {
      throw new FieldSettingsError(`${existing.label} must stay a ${existing.inputType} so existing records and pipeline rules keep working.`);
    }
    inputType = data.inputType;
  }
  if ((inputType === "select" || inputType === "multiselect") && !existing.listKey) {
    throw new FieldSettingsError(`${existing.label} does not have a dropdown list, so it cannot be a select field.`);
  }
  const sectionKey = data.sectionKey === undefined ? existing.sectionKey : data.sectionKey;
  if (!isFieldSectionKey(sectionKey)) throw new FieldSettingsError("Choose a valid form section.");
  if (DEFAULT_FIELD_SECTIONS[sectionKey].entity !== existing.entity) {
    throw new FieldSettingsError("Keep this field in a section for the same form.");
  }
  const sortOrder = data.sortOrder === undefined ? existing.sortOrder : Number(data.sortOrder);
  if (!Number.isInteger(sortOrder) || sortOrder < 0 || sortOrder > 500) {
    throw new FieldSettingsError("Sort order must be a whole number.");
  }
  return {
    ...existing,
    label,
    helpText,
    inputType,
    isRequired: data.isRequired === undefined ? existing.isRequired : data.isRequired !== false,
    isActive: data.isActive === undefined ? existing.isActive : data.isActive !== false,
    sortOrder,
    sectionKey,
  } satisfies FieldDefinition;
}

export function normalizeViewColumnsUpdate(viewKeyValue: unknown, columnsValue: unknown, existing: ViewColumn[]) {
  if (!isViewKey(viewKeyValue)) throw new FieldSettingsError("Choose a valid table view.");
  if (!Array.isArray(columnsValue) || columnsValue.length === 0) throw new FieldSettingsError("Table columns are required.");
  const existingByKey = new Map(existing.map((column) => [column.columnKey, column]));
  const seen = new Set<string>();
  const next = columnsValue.map((column, index) => {
    if (!column || typeof column !== "object") throw new FieldSettingsError("Each column needs a key.");
    const data = column as Record<string, unknown>;
    const columnKey = typeof data.columnKey === "string" ? data.columnKey : "";
    const current = existingByKey.get(columnKey);
    if (!current) throw new FieldSettingsError("Unknown table column.");
    if (seen.has(columnKey)) throw new FieldSettingsError("Each table column can only appear once.");
    seen.add(columnKey);
    const label = typeof data.label === "string" ? data.label.trim() : current.label;
    if (!label) throw new FieldSettingsError("Each column needs a label.");
    if (label.length > 80) throw new FieldSettingsError("Column labels must be 80 characters or fewer.");
    const isVisible = data.isVisible === undefined ? current.isVisible : data.isVisible !== false;
    if (current.isLocked && !isVisible) throw new FieldSettingsError(`${current.label} stays visible so the table remains usable.`);
    return {
      ...current,
      label,
      isVisible,
      sortOrder: index,
    } satisfies ViewColumn;
  });
  for (const current of existing) {
    if (seen.has(current.columnKey)) continue;
    next.push({ ...current, sortOrder: next.length, isVisible: current.isLocked ? true : current.isVisible });
  }
  return { viewKey: viewKeyValue, columns: next };
}

export function normalizeSectionsUpdate(value: unknown) {
  if (!value || typeof value !== "object") throw new FieldSettingsError("Form section titles are required.");
  const data = value as Record<string, unknown>;
  const sections = defaultFieldSections();
  for (const key of FIELD_SECTION_KEYS) {
    if (!(key in data)) continue;
    const next = typeof data[key] === "string" ? data[key].trim() : "";
    if (!next) throw new FieldSettingsError("Each form section needs a title.");
    if (next.length > 80) throw new FieldSettingsError("Section titles must be 80 characters or fewer.");
    sections[key] = next;
  }
  return sections;
}

export function emptyViews(): Record<ViewKey, ViewColumn[]> {
  return Object.fromEntries(VIEW_KEYS.map((key) => [key, []])) as Record<ViewKey, ViewColumn[]>;
}
