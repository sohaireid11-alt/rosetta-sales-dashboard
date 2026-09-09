import { DEFAULT_FIELD_DEFINITIONS, DEFAULT_VIEW_COLUMNS, type FieldDefinition, type FieldEntity, type ViewColumn, type ViewKey } from "../../admin-catalog";
import { getDatabase } from "../../../db";
import {
  defaultFieldSettings,
  emptyFieldLists,
  emptyViews,
  FieldSettingsError,
  mergeListOptions,
  normalizeFieldDefinitionUpdate,
  normalizeHistoryLookbackDays,
  normalizeLabelsUpdate,
  normalizeListUpdate,
  normalizeReportPresets,
  normalizeSectionsUpdate,
  normalizeViewColumnsUpdate,
  normalizeWorkspaceFlags,
  parseStoredHistoryLookbackDays,
  parseStoredLabels,
  parseStoredReportPresets,
  parseStoredWorkspaceFlags,
  type FieldLists,
  type FieldOption,
  type FieldSections,
  type FieldSettings,
  type UiLabels,
} from "../../lib/field-settings-core";
import { DEFAULT_UI_LABELS, FIELD_LIST_DEFAULTS, FIELD_LIST_KEYS, type FieldListKey } from "../../sales-config";

type StoredOption = {
  id: number;
  listKey: FieldListKey;
  value: string;
  label: string;
  sortOrder: number;
  isActive: number | boolean;
};

type StoredField = {
  entity: FieldEntity;
  fieldKey: string;
  label: string;
  helpText: string;
  inputType: FieldDefinition["inputType"];
  isRequired: number | boolean;
  isActive: number | boolean;
  sortOrder: number;
  sectionKey: FieldDefinition["sectionKey"];
  listKey: string | null;
  storageColumn: string;
  showOnContributor: number | boolean;
  typeLocked: number | boolean;
};

type StoredViewColumn = {
  viewKey: ViewKey;
  columnKey: string;
  label: string;
  isVisible: number | boolean;
  sortOrder: number;
  isLocked: number | boolean;
};

const LABELS_KEY = "ui_labels";
const SECTIONS_KEY = "field_sections";
const HISTORY_LOOKBACK_KEY = "history_lookback_days";
const REPORT_PRESETS_KEY = "report_presets";
const WORKSPACE_FLAGS_KEY = "workspace_flags";

function asOption(row: StoredOption): FieldOption {
  return {
    id: row.id,
    value: row.value,
    label: row.label,
    sortOrder: row.sortOrder,
    isActive: Boolean(row.isActive),
  };
}

function asField(row: StoredField): FieldDefinition {
  const fallback = DEFAULT_FIELD_DEFINITIONS.find((field) => field.entity === row.entity && field.fieldKey === row.fieldKey);
  return {
    fieldKey: row.fieldKey,
    entity: row.entity,
    label: row.label,
    helpText: row.helpText ?? "",
    inputType: row.inputType,
    isRequired: Boolean(row.isRequired),
    isActive: Boolean(row.isActive),
    sortOrder: row.sortOrder,
    sectionKey: row.sectionKey,
    listKey: (row.listKey as FieldDefinition["listKey"]) ?? fallback?.listKey ?? null,
    storageColumn: row.storageColumn || fallback?.storageColumn || row.fieldKey,
    showOnContributor: Boolean(row.showOnContributor),
    typeLocked: Boolean(row.typeLocked),
  };
}

function asViewColumn(row: StoredViewColumn): ViewColumn {
  const fallback = DEFAULT_VIEW_COLUMNS.find((column) => column.viewKey === row.viewKey && column.columnKey === row.columnKey);
  return {
    viewKey: row.viewKey,
    columnKey: row.columnKey,
    label: row.label,
    isVisible: Boolean(row.isVisible),
    sortOrder: row.sortOrder,
    isLocked: fallback?.isLocked ?? Boolean(row.isLocked),
  };
}

function isMissingTable(error: unknown) {
  return error instanceof Error && error.message.includes("no such table");
}

function parseStoredSections(raw: string | null | undefined): FieldSections {
  const defaults = defaultFieldSettings().sections;
  if (!raw) return defaults;
  try {
    return normalizeSectionsUpdate({ ...defaults, ...(JSON.parse(raw) as Record<string, unknown>) });
  } catch {
    return defaults;
  }
}

async function seedFieldSettings() {
  const database = await getDatabase();
  const existing = await database.prepare(
    "SELECT DISTINCT list_key AS listKey FROM app_field_options"
  ).all<{ listKey: string }>();
  const present = new Set(existing.results.map((row) => row.listKey));
  const now = new Date().toISOString();
  const inserts: { bind: (...values: unknown[]) => unknown }[] = [];

  for (const listKey of FIELD_LIST_KEYS) {
    if (present.has(listKey)) continue;
    FIELD_LIST_DEFAULTS[listKey].forEach((value, index) => {
      inserts.push(
        database.prepare(
          "INSERT INTO app_field_options (list_key, option_value, option_label, sort_order, is_active, created_at, updated_at) VALUES (?, ?, ?, ?, 1, ?, ?)"
        ).bind(listKey, value, value, index, now, now)
      );
    });
  }

  if (inserts.length) await database.batch(inserts);

  const labels = await database.prepare("SELECT key FROM app_settings WHERE key = ?").bind(LABELS_KEY).first();
  if (!labels) {
    await database.prepare(
      "INSERT INTO app_settings (key, value, updated_at) VALUES (?, ?, ?)"
    ).bind(LABELS_KEY, JSON.stringify(DEFAULT_UI_LABELS), now).run();
  }

  const sections = await database.prepare("SELECT key FROM app_settings WHERE key = ?").bind(SECTIONS_KEY).first();
  if (!sections) {
    await database.prepare(
      "INSERT INTO app_settings (key, value, updated_at) VALUES (?, ?, ?)"
    ).bind(SECTIONS_KEY, JSON.stringify(defaultFieldSettings().sections), now).run();
  }

  const historyLookback = await database.prepare("SELECT key FROM app_settings WHERE key = ?").bind(HISTORY_LOOKBACK_KEY).first();
  if (!historyLookback) {
    await database.prepare(
      "INSERT INTO app_settings (key, value, updated_at) VALUES (?, ?, ?)"
    ).bind(HISTORY_LOOKBACK_KEY, JSON.stringify(defaultFieldSettings().historyLookbackDays), now).run();
  }

  const reportPresets = await database.prepare("SELECT key FROM app_settings WHERE key = ?").bind(REPORT_PRESETS_KEY).first();
  if (!reportPresets) {
    await database.prepare(
      "INSERT INTO app_settings (key, value, updated_at) VALUES (?, ?, ?)"
    ).bind(REPORT_PRESETS_KEY, JSON.stringify(defaultFieldSettings().reportPresets), now).run();
  }

  const workspaceFlags = await database.prepare("SELECT key FROM app_settings WHERE key = ?").bind(WORKSPACE_FLAGS_KEY).first();
  if (!workspaceFlags) {
    await database.prepare(
      "INSERT INTO app_settings (key, value, updated_at) VALUES (?, ?, ?)"
    ).bind(WORKSPACE_FLAGS_KEY,     JSON.stringify({
      customReportRangeEnabled: defaultFieldSettings().customReportRangeEnabled,
      showBackControl: defaultFieldSettings().showBackControl,
      includeWonLeadsInClientCare: defaultFieldSettings().includeWonLeadsInClientCare,
    }), now).run();
  }

  await seedFieldDefinitions(now);
  await seedViewColumns(now);
}

async function seedFieldDefinitions(now: string) {
  const database = await getDatabase();
  const existing = await database.prepare(
    "SELECT entity, field_key AS fieldKey FROM app_field_definitions"
  ).all<{ entity: string; fieldKey: string }>();
  const present = new Set(existing.results.map((row) => `${row.entity}\u0000${row.fieldKey}`));
  const inserts = DEFAULT_FIELD_DEFINITIONS
    .filter((field) => !present.has(`${field.entity}\u0000${field.fieldKey}`))
    .map((field) => database.prepare(
      `INSERT INTO app_field_definitions (
        entity, field_key, label, help_text, input_type, is_required, is_active, sort_order,
        section_key, list_key, storage_column, show_on_contributor, type_locked, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      field.entity, field.fieldKey, field.label, field.helpText, field.inputType,
      field.isRequired ? 1 : 0, field.isActive ? 1 : 0, field.sortOrder, field.sectionKey,
      field.listKey, field.storageColumn, field.showOnContributor ? 1 : 0, field.typeLocked ? 1 : 0, now
    ));
  if (inserts.length) await database.batch(inserts);
}

async function seedViewColumns(now: string) {
  const database = await getDatabase();
  const existing = await database.prepare(
    "SELECT view_key AS viewKey, column_key AS columnKey FROM app_view_columns"
  ).all<{ viewKey: string; columnKey: string }>();
  const present = new Set(existing.results.map((row) => `${row.viewKey}\u0000${row.columnKey}`));
  const missing = DEFAULT_VIEW_COLUMNS
    .filter((column) => !present.has(`${column.viewKey}\u0000${column.columnKey}`))
    .slice()
    .sort((left, right) => left.sortOrder - right.sortOrder || left.columnKey.localeCompare(right.columnKey));
  if (!missing.length) return;
  const statements = missing.flatMap((column) => [
    database.prepare(
      "UPDATE app_view_columns SET sort_order = sort_order + 1, updated_at = ? WHERE view_key = ? AND sort_order >= ?"
    ).bind(now, column.viewKey, column.sortOrder),
    database.prepare(
      "INSERT INTO app_view_columns (view_key, column_key, label, is_visible, sort_order, is_locked, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)"
    ).bind(
      column.viewKey, column.columnKey, column.label, column.isVisible ? 1 : 0, column.sortOrder, column.isLocked ? 1 : 0, now
    ),
  ]);
  await database.batch(statements);
}

export async function getFieldSettings(includeRetired = false): Promise<FieldSettings> {
  try {
    await seedFieldSettings();
    const database = await getDatabase();
    const options = await database.prepare(
      `SELECT id, list_key AS listKey, option_value AS value, option_label AS label, sort_order AS sortOrder, is_active AS isActive
       FROM app_field_options
       ORDER BY list_key, sort_order, id`
    ).all<StoredOption>();
    const lists = emptyFieldLists();
    for (const row of options.results) {
      if (!FIELD_LIST_KEYS.includes(row.listKey)) continue;
      if (!includeRetired && !row.isActive) continue;
      lists[row.listKey].push(asOption(row));
    }
    const defaults = defaultFieldSettings();
    for (const listKey of FIELD_LIST_KEYS) {
      if (lists[listKey].length) continue;
      lists[listKey] = defaults.lists[listKey];
    }
    const storedLabels = await database.prepare("SELECT value FROM app_settings WHERE key = ?").bind(LABELS_KEY).first<{ value: string }>();
    const storedSections = await database.prepare("SELECT value FROM app_settings WHERE key = ?").bind(SECTIONS_KEY).first<{ value: string }>();
    const storedHistoryLookback = await database.prepare("SELECT value FROM app_settings WHERE key = ?").bind(HISTORY_LOOKBACK_KEY).first<{ value: string }>();
    const storedReportPresets = await database.prepare("SELECT value FROM app_settings WHERE key = ?").bind(REPORT_PRESETS_KEY).first<{ value: string }>();
    const storedWorkspaceFlags = await database.prepare("SELECT value FROM app_settings WHERE key = ?").bind(WORKSPACE_FLAGS_KEY).first<{ value: string }>();
    const fields = await loadFieldDefinitions();
    const views = await loadViewColumns();
    const workspaceFlags = parseStoredWorkspaceFlags(storedWorkspaceFlags?.value);
    return {
      lists,
      labels: parseStoredLabels(storedLabels?.value),
      fields,
      views,
      sections: parseStoredSections(storedSections?.value),
      historyLookbackDays: parseStoredHistoryLookbackDays(storedHistoryLookback?.value),
      reportPresets: parseStoredReportPresets(storedReportPresets?.value),
      customReportRangeEnabled: workspaceFlags.customReportRangeEnabled,
      showBackControl: workspaceFlags.showBackControl,
      includeWonLeadsInClientCare: workspaceFlags.includeWonLeadsInClientCare,
    };
  } catch (error) {
    if (isMissingTable(error)) return defaultFieldSettings();
    throw error;
  }
}

async function loadFieldDefinitions() {
  const database = await getDatabase();
  const rows = await database.prepare(
    `SELECT entity, field_key AS fieldKey, label, help_text AS helpText, input_type AS inputType,
            is_required AS isRequired, is_active AS isActive, sort_order AS sortOrder, section_key AS sectionKey,
            list_key AS listKey, storage_column AS storageColumn, show_on_contributor AS showOnContributor, type_locked AS typeLocked
     FROM app_field_definitions
     ORDER BY entity, sort_order, field_key`
  ).all<StoredField>();
  const loaded = new Map(rows.results.map((row) => [`${row.entity}\u0000${row.fieldKey}`, asField(row)]));
  return DEFAULT_FIELD_DEFINITIONS.map((field) => loaded.get(`${field.entity}\u0000${field.fieldKey}`) ?? { ...field });
}

async function loadViewColumns() {
  const database = await getDatabase();
  const rows = await database.prepare(
    `SELECT view_key AS viewKey, column_key AS columnKey, label, is_visible AS isVisible, sort_order AS sortOrder, is_locked AS isLocked
     FROM app_view_columns
     ORDER BY view_key, sort_order, id`
  ).all<StoredViewColumn>();
  const views = emptyViews();
  for (const row of rows.results) {
    if (!(row.viewKey in views)) continue;
    views[row.viewKey].push(asViewColumn(row));
  }
  const defaults = defaultFieldSettings().views;
  for (const viewKey of Object.keys(defaults) as ViewKey[]) {
    if (!views[viewKey].length) {
      views[viewKey] = defaults[viewKey];
      continue;
    }
    const present = new Set(views[viewKey].map((column) => column.columnKey));
    const missing = defaults[viewKey].filter((column) => !present.has(column.columnKey));
    if (!missing.length) continue;
    views[viewKey] = [...views[viewKey], ...missing].sort(
      (left, right) => left.sortOrder - right.sortOrder || left.columnKey.localeCompare(right.columnKey)
    );
  }
  return views;
}

export async function getOptionLists() {
  const settings = await getFieldSettings(true);
  return Object.fromEntries(
    FIELD_LIST_KEYS.map((key) => [key, settings.lists[key].map((option) => option.value)])
  ) as Record<FieldListKey, string[]>;
}

export async function replaceFieldList(listKeyValue: unknown, optionsValue: unknown) {
  const { listKey, options } = normalizeListUpdate(listKeyValue, optionsValue);
  const settings = await getFieldSettings(true);
  const next = mergeListOptions(settings.lists[listKey], options);
  const database = await getDatabase();
  const existing = await database.prepare(
    "SELECT id, list_key AS listKey, option_value AS value, option_label AS label, sort_order AS sortOrder, is_active AS isActive FROM app_field_options WHERE list_key = ?"
  ).bind(listKey).all<StoredOption>();
  const existingByValue = new Map(existing.results.map((row) => [row.value.toLocaleLowerCase(), row]));
  const now = new Date().toISOString();
  const statements = next.map((option) => {
    const current = existingByValue.get(option.value.toLocaleLowerCase());
    if (current) {
      return database.prepare(
        "UPDATE app_field_options SET option_label = ?, sort_order = ?, is_active = ?, updated_at = ? WHERE id = ?"
      ).bind(option.label, option.sortOrder, option.isActive ? 1 : 0, now, current.id);
    }
    return database.prepare(
      "INSERT INTO app_field_options (list_key, option_value, option_label, sort_order, is_active, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)"
    ).bind(listKey, option.value, option.label, option.sortOrder, option.isActive ? 1 : 0, now, now);
  });
  if (statements.length) await database.batch(statements);
  return getFieldSettings(true);
}

export async function replaceUiLabels(value: unknown) {
  const labels = normalizeLabelsUpdate(value);
  const database = await getDatabase();
  const now = new Date().toISOString();
  await database.prepare(
    "INSERT INTO app_settings (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at"
  ).bind(LABELS_KEY, JSON.stringify(labels), now).run();
  return getFieldSettings(true);
}

export async function replaceFieldDefinition(entityValue: unknown, fieldKeyValue: unknown, patch: unknown) {
  const settings = await getFieldSettings(true);
  const existing = settings.fields.find((field) => field.entity === entityValue && field.fieldKey === fieldKeyValue);
  if (!existing) throw new FieldSettingsError("Choose a valid form field.");
  const next = normalizeFieldDefinitionUpdate(patch, existing);
  const database = await getDatabase();
  const now = new Date().toISOString();
  await database.prepare(
    `UPDATE app_field_definitions
     SET label = ?, help_text = ?, input_type = ?, is_required = ?, is_active = ?, sort_order = ?, section_key = ?, updated_at = ?
     WHERE entity = ? AND field_key = ?`
  ).bind(
    next.label, next.helpText, next.inputType, next.isRequired ? 1 : 0, next.isActive ? 1 : 0,
    next.sortOrder, next.sectionKey, now, next.entity, next.fieldKey
  ).run();
  return getFieldSettings(true);
}

export async function replaceViewColumns(viewKeyValue: unknown, columnsValue: unknown) {
  const settings = await getFieldSettings(true);
  if (typeof viewKeyValue !== "string" || !(viewKeyValue in settings.views)) {
    throw new FieldSettingsError("Choose a valid table view.");
  }
  const { viewKey, columns } = normalizeViewColumnsUpdate(viewKeyValue, columnsValue, settings.views[viewKeyValue as ViewKey]);
  const database = await getDatabase();
  const now = new Date().toISOString();
  const statements = columns.map((column) => database.prepare(
    "UPDATE app_view_columns SET label = ?, is_visible = ?, sort_order = ?, updated_at = ? WHERE view_key = ? AND column_key = ?"
  ).bind(column.label, column.isVisible ? 1 : 0, column.sortOrder, now, viewKey, column.columnKey));
  if (statements.length) await database.batch(statements);
  return getFieldSettings(true);
}

export async function replaceSections(value: unknown) {
  const sections = normalizeSectionsUpdate(value);
  const database = await getDatabase();
  const now = new Date().toISOString();
  await database.prepare(
    "INSERT INTO app_settings (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at"
  ).bind(SECTIONS_KEY, JSON.stringify(sections), now).run();
  return getFieldSettings(true);
}

async function writeSetting(key: string, value: unknown) {
  const database = await getDatabase();
  const now = new Date().toISOString();
  await database.prepare(
    "INSERT INTO app_settings (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at"
  ).bind(key, JSON.stringify(value), now).run();
}

export async function replaceHistoryLookbackDays(value: unknown) {
  await writeSetting(HISTORY_LOOKBACK_KEY, normalizeHistoryLookbackDays(value));
  return getFieldSettings(true);
}

export async function replaceReportPresets(value: unknown) {
  await writeSetting(REPORT_PRESETS_KEY, normalizeReportPresets(value));
  return getFieldSettings(true);
}

export async function replaceWorkspaceFlags(value: unknown) {
  const settings = await getFieldSettings(true);
  await writeSetting(WORKSPACE_FLAGS_KEY, normalizeWorkspaceFlags(value, settings));
  return getFieldSettings(true);
}

export function publicFieldSettings(settings: FieldSettings, includeRetired: boolean): FieldSettings {
  const lists = emptyFieldLists();
  for (const listKey of FIELD_LIST_KEYS) {
    lists[listKey] = includeRetired
      ? settings.lists[listKey]
      : settings.lists[listKey].filter((option) => option.isActive);
  }
  return {
    lists,
    labels: settings.labels,
    fields: includeRetired ? settings.fields : settings.fields.filter((field) => field.isActive),
    views: settings.views,
    sections: settings.sections,
    historyLookbackDays: settings.historyLookbackDays,
    reportPresets: settings.reportPresets,
    customReportRangeEnabled: settings.customReportRangeEnabled,
    showBackControl: settings.showBackControl,
    includeWonLeadsInClientCare: settings.includeWonLeadsInClientCare,
  };
}

export function fieldSettingsError(error: unknown) {
  if (error instanceof FieldSettingsError) return error.message;
  if (error instanceof Error && error.message.includes("no such table")) {
    return "Field settings are still being prepared. Please retry in a moment.";
  }
  return error instanceof Error ? error.message : "Unable to update field settings.";
}

export type { FieldLists, FieldSettings, UiLabels };
