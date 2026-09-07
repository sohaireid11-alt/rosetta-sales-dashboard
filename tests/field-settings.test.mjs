import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const files = {
  schema: new URL("../db/schema.ts", import.meta.url),
  migration: new URL("../drizzle/0007_admin_control_center.sql", import.meta.url),
  salesConfig: new URL("../app/sales-config.ts", import.meta.url),
  catalog: new URL("../app/admin-catalog.ts", import.meta.url),
  core: new URL("../app/lib/field-settings-core.ts", import.meta.url),
  values: new URL("../app/lib/field-values.ts", import.meta.url),
  api: new URL("../app/api/field-settings/route.ts", import.meta.url),
  utils: new URL("../app/api/field-settings/field-settings-utils.ts", import.meta.url),
  page: new URL("../app/field-settings/page.tsx", import.meta.url),
  admin: new URL("../app/admin/page.tsx", import.meta.url),
  home: new URL("../app/page.tsx", import.meta.url),
  contributor: new URL("../app/contributor-form.tsx", import.meta.url),
  team: new URL("../app/team/page.tsx", import.meta.url),
  recordUtils: new URL("../app/api/deals/record-utils.ts", import.meta.url),
  schemaField: new URL("../app/schema-field.tsx", import.meta.url),
};

test("persists field definitions, view columns, and picklists", async () => {
  const [schema, migration, catalog, salesConfig] = await Promise.all([
    readFile(files.schema, "utf8"),
    readFile(files.migration, "utf8"),
    readFile(files.catalog, "utf8"),
    readFile(files.salesConfig, "utf8"),
  ]);

  assert.match(schema, /app_field_options/);
  assert.match(schema, /app_field_definitions/);
  assert.match(schema, /app_view_columns/);
  assert.match(schema, /input_type/);
  assert.match(migration, /CREATE TABLE `app_field_definitions`/);
  assert.match(migration, /CREATE TABLE `app_view_columns`/);
  assert.match(catalog, /export const DEFAULT_FIELD_DEFINITIONS/);
  assert.match(catalog, /field\("service"/);
  assert.match(catalog, /field\("sourceType"/);
  assert.match(catalog, /field\("nextAction"/);
  assert.match(catalog, /"select"/);
  assert.match(catalog, /multiselect/);
  assert.match(salesConfig, /export const FIELD_LIST_DEFAULTS/);
  assert.match(salesConfig, /navAdminControls/);
  assert.match(salesConfig, /importToolbarCopy/);
  assert.match(salesConfig, /teamHeading/);
});

test("keeps admin-only writes and schema-driven forms", async () => {
  const [api, page, admin, home, contributor, team, recordUtils, schemaField] = await Promise.all([
    readFile(files.api, "utf8"),
    readFile(files.page, "utf8"),
    readFile(files.admin, "utf8"),
    readFile(files.home, "utf8"),
    readFile(files.contributor, "utf8"),
    readFile(files.team, "utf8"),
    readFile(files.recordUtils, "utf8"),
    readFile(files.schemaField, "utf8"),
  ]);

  assert.match(api, /requireRole\(request, \["admin", "contributor"\]\)/);
  assert.match(api, /requireRole\(request, \["admin"\]\)/);
  assert.match(api, /export async function PATCH/);
  assert.match(api, /replaceFieldDefinition/);
  assert.match(page, /Admin Control Center/);
  assert.match(page, /Change a dropdown to multi-select/);
  assert.match(page, /Add option/);
  assert.match(page, /Remove from dropdowns/);
  assert.match(page, /Multi-select/);
  assert.match(page, /Coming next/);
  assert.match(page, /History & reports/);
  assert.match(page, /historyLookbackDays/);
  assert.match(page, /reportPresets/);
  assert.match(admin, /field-settings\/page/);
  assert.match(home, /\/api\/field-settings/);
  assert.match(home, /SchemaField/);
  assert.match(home, /SettingsMenu/);
  assert.match(contributor, /SchemaField/);
  assert.match(contributor, /\/api\/field-settings/);
  assert.match(contributor, /SettingsMenu/);
  assert.match(team, /SettingsMenu/);
  assert.match(team, /labels.teamHeading/);
  assert.match(recordUtils, /serializeStoredValues/);
  assert.match(recordUtils, /allowMultiple/);
  assert.match(schemaField, /inputType === "multiselect"/);
});

test("makes add and remove the primary picklist workflow", async () => {
  const page = await readFile(files.page, "utf8");

  assert.match(page, /Dropdown options/);
  assert.match(page, /Add a dropdown option/);
  assert.match(page, /Type a new choice, then press Enter/);
  assert.match(page, /Remove from dropdowns/);
  assert.match(page, /Restore/);
  assert.match(page, /Hidden from dropdowns/);
  assert.match(page, /function addOption/);
  assert.match(page, /function removeOption/);
  assert.match(page, /FIELD_LIST_KEYS\.map/);
  assert.match(page, /picklist-nav/);
  assert.match(page, /No options yet/);
  assert.match(page, /Permanent delete is not used/);
});

test("stores multi-select values in the same text column", async () => {
  const [values, recordUtils, home] = await Promise.all([
    readFile(files.values, "utf8"),
    readFile(files.recordUtils, "utf8"),
    readFile(files.home, "utf8"),
  ]);

  assert.match(values, /function parseStoredValues/);
  assert.match(values, /function serializeStoredValues/);
  assert.match(values, /JSON.stringify/);
  assert.match(values, /Historical or current single value/i);
  assert.match(recordUtils, /parseStoredValues/);
  assert.match(recordUtils, /includesChoice\(service, SCHEDULED_INTERPRETATION_SERVICE\)/);
  assert.match(home, /choiceLabel/);
  assert.doesNotMatch(home, /Danyal/);
  assert.doesNotMatch(home, /Fady/);
});

test("hides inactive options and reads config before hardcoded defaults", async () => {
  const [core, home, contributor, utils] = await Promise.all([
    readFile(files.core, "utf8"),
    readFile(files.home, "utf8"),
    readFile(files.contributor, "utf8"),
    readFile(files.utils, "utf8"),
  ]);

  assert.match(core, /function visibleOptions/);
  assert.match(core, /const active = list.filter\(\(option\) => option.isActive\)/);
  assert.match(core, /Keep at least one option in the dropdown/);
  assert.match(core, /function mergeListOptions/);
  assert.match(core, /normalizeFieldDefinitionUpdate/);
  assert.match(home, /salesFields\(fieldSettings\)/);
  assert.match(contributor, /salesFields\(fieldSettings, true\)/);
  assert.match(utils, /seedFieldDefinitions/);
  assert.match(utils, /DEFAULT_FIELD_DEFINITIONS/);
});

function parseStoredValues(raw) {
  if (raw === null || raw === undefined) return [];
  if (Array.isArray(raw)) return [...new Set(raw.map((value) => String(value).trim()).filter(Boolean))];
  if (typeof raw !== "string") return [];
  const text = raw.trim();
  if (!text) return [];
  if (text.startsWith("[")) {
    try {
      const parsed = JSON.parse(text);
      if (Array.isArray(parsed)) return parsed.map((value) => String(value).trim()).filter(Boolean);
    } catch {
      return [text];
    }
  }
  return [text];
}

function serializeStoredValues(values, allowMultiple = true) {
  const parsed = parseStoredValues(values);
  if (!parsed.length) return "";
  if (!allowMultiple || parsed.length === 1) return parsed[0];
  return JSON.stringify(parsed);
}

test("accepts historical single values and new multi values", () => {
  assert.deepEqual(parseStoredValues("Scheduled Interpretation"), ["Scheduled Interpretation"]);
  assert.deepEqual(parseStoredValues('["Call","Email"]'), ["Call", "Email"]);
  assert.deepEqual(parseStoredValues(""), []);
  assert.equal(serializeStoredValues(["Voice Over"], true), "Voice Over");
  assert.equal(serializeStoredValues(["Call", "Email"], true), '["Call","Email"]');
  assert.equal(serializeStoredValues(["Call", "Email"], false), "Call");
});
