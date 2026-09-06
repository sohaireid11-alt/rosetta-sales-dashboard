import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const files = {
  schema: new URL("../db/schema.ts", import.meta.url),
  migration: new URL("../drizzle/0006_cold_sunset_bain.sql", import.meta.url),
  salesConfig: new URL("../app/sales-config.ts", import.meta.url),
  core: new URL("../app/lib/field-settings-core.ts", import.meta.url),
  api: new URL("../app/api/field-settings/route.ts", import.meta.url),
  utils: new URL("../app/api/field-settings/field-settings-utils.ts", import.meta.url),
  page: new URL("../app/field-settings/page.tsx", import.meta.url),
  home: new URL("../app/page.tsx", import.meta.url),
  contributor: new URL("../app/contributor-form.tsx", import.meta.url),
  team: new URL("../app/team/page.tsx", import.meta.url),
  recordUtils: new URL("../app/api/deals/record-utils.ts", import.meta.url),
};

test("persists configurable field options and seeds from sales-config", async () => {
  const [schema, migration, salesConfig] = await Promise.all([
    readFile(files.schema, "utf8"),
    readFile(files.migration, "utf8"),
    readFile(files.salesConfig, "utf8"),
  ]);

  assert.match(schema, /app_field_options/);
  assert.match(schema, /option_value/);
  assert.match(schema, /option_label/);
  assert.match(schema, /is_active/);
  assert.match(schema, /app_settings/);
  assert.match(migration, /CREATE TABLE `app_field_options`/);
  assert.match(migration, /CREATE TABLE `app_settings`/);
  assert.match(salesConfig, /export const STATUSES/);
  assert.match(salesConfig, /export const FIELD_LIST_DEFAULTS/);
  assert.match(salesConfig, /export const DEFAULT_UI_LABELS/);
  assert.match(salesConfig, /export const FIELD_LIST_KEYS/);
  for (const key of [
    "statuses",
    "sourceTypes",
    "services",
    "interpretationDeliveries",
    "interpretationModes",
    "meetingStages",
    "followUpActions",
    "opportunityTypes",
    "organizationTypes",
    "activityTypes",
    "satisfactionStatuses",
    "relationshipTypes",
  ]) {
    assert.match(salesConfig, new RegExp(`${key}:`));
  }
});

test("keeps field settings writes admin-only and forms load stored options", async () => {
  const [api, page, home, contributor, team, recordUtils] = await Promise.all([
    readFile(files.api, "utf8"),
    readFile(files.page, "utf8"),
    readFile(files.home, "utf8"),
    readFile(files.contributor, "utf8"),
    readFile(files.team, "utf8"),
    readFile(files.recordUtils, "utf8"),
  ]);

  assert.match(api, /requireRole\(request, \["admin", "contributor"\]\)/);
  assert.match(api, /requireRole\(request, \["admin"\]\)/);
  assert.match(page, /Field settings/);
  assert.match(page, /Add option/);
  assert.match(page, /Remove from dropdowns/);
  assert.match(home, /\/api\/field-settings/);
  assert.match(home, /Field settings/);
  assert.match(contributor, /\/api\/field-settings/);
  assert.match(team, /\/field-settings/);
  assert.match(recordUtils, /getOptionLists/);
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

  const picklistsIndex = page.indexOf("{FIELD_LIST_KEYS.map((listKey) => {");
  const labelsIndex = page.indexOf('id="display-labels"');
  assert.ok(picklistsIndex > 0 && labelsIndex > picklistsIndex, "picklists should appear before display labels");
});

test("hides inactive options from dashboard and contributor dropdowns", async () => {
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
  assert.match(core, /isActive: false/);
  assert.match(core, /normalizeLabelsUpdate/);
  assert.match(home, /visibleOptions\(options, currentValue\)/);
  assert.match(contributor, /visibleOptions\(options, currentValue\)/);
  assert.match(utils, /lists\[listKey\] = settings\.lists\[listKey\]\.filter\(\(option\) => option.isActive\)/);
  assert.match(utils, /if \(!includeRetired && !row.isActive\) continue/);
});
