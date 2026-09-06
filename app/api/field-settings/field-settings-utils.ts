import { getDatabase } from "../../../db";
import {
  defaultFieldSettings,
  emptyFieldLists,
  FieldSettingsError,
  mergeListOptions,
  normalizeLabelsUpdate,
  normalizeListUpdate,
  parseStoredLabels,
  type FieldLists,
  type FieldOption,
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

const LABELS_KEY = "ui_labels";

function asOption(row: StoredOption): FieldOption {
  return {
    id: row.id,
    value: row.value,
    label: row.label,
    sortOrder: row.sortOrder,
    isActive: Boolean(row.isActive),
  };
}

function isMissingTable(error: unknown) {
  return error instanceof Error && error.message.includes("no such table");
}

async function seedFieldSettings() {
  const database = await getDatabase();
  const existing = await database.prepare(
    "SELECT DISTINCT list_key AS listKey FROM app_field_options"
  ).all<{ listKey: string }>();
  const present = new Set(existing.results.map((row) => row.listKey));
  const now = new Date().toISOString();
  const inserts = [];

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
    for (const listKey of FIELD_LIST_KEYS) {
      if (lists[listKey].length) continue;
      lists[listKey] = defaultFieldSettings().lists[listKey];
    }
    const stored = await database.prepare("SELECT value FROM app_settings WHERE key = ?").bind(LABELS_KEY).first<{ value: string }>();
    return { lists, labels: parseStoredLabels(stored?.value) };
  } catch (error) {
    if (isMissingTable(error)) return defaultFieldSettings();
    throw error;
  }
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

export function publicFieldSettings(settings: FieldSettings, includeRetired: boolean): FieldSettings {
  if (includeRetired) return settings;
  const lists = emptyFieldLists();
  for (const listKey of FIELD_LIST_KEYS) {
    lists[listKey] = settings.lists[listKey].filter((option) => option.isActive);
  }
  return { lists, labels: settings.labels };
}

export function fieldSettingsError(error: unknown) {
  if (error instanceof FieldSettingsError) return error.message;
  if (error instanceof Error && error.message.includes("no such table")) {
    return "Field settings are still being prepared. Please retry in a moment.";
  }
  return error instanceof Error ? error.message : "Unable to update field settings.";
}

export type { FieldLists, FieldSettings, UiLabels };
