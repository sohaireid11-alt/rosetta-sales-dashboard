import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { normalizeListUpdate, normalizeLabelsUpdate, mergeListOptions, FieldSettingsError } from "../app/lib/field-settings-core.ts";

const files = {
  schema: new URL("../db/schema.ts", import.meta.url),
  migration: new URL("../drizzle/0006_cold_sunset_bain.sql", import.meta.url),
  salesConfig: new URL("../app/sales-config.ts", import.meta.url),
  api: new URL("../app/api/field-settings/route.ts", import.meta.url),
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
  assert.match(page, /Retire an option instead of deleting it/);
  assert.match(home, /\/api\/field-settings/);
  assert.match(home, /Field settings/);
  assert.match(contributor, /\/api\/field-settings/);
  assert.match(team, /\/field-settings/);
  assert.match(recordUtils, /getOptionLists/);
  assert.doesNotMatch(home, /from "\.\/sales-config".*STATUSES/s);
});

test("rejects empty picklists and keeps omitted options retired", () => {
  assert.throws(() => normalizeListUpdate("statuses", []), FieldSettingsError);
  assert.throws(
    () => normalizeListUpdate("statuses", [{ value: "New", label: "New", isActive: false }]),
    /Keep at least one active option/,
  );

  const update = normalizeListUpdate("statuses", [
    { value: "New", label: "New lead", isActive: true },
    { value: "Pending", label: "Pending", isActive: true },
  ]);
  const merged = mergeListOptions(
    [
      { id: 1, value: "New", label: "New", sortOrder: 0, isActive: true },
      { id: 2, value: "Won", label: "Won", sortOrder: 1, isActive: true },
    ],
    update.options,
  );
  assert.equal(merged.find((option) => option.value === "New")?.label, "New lead");
  assert.equal(merged.find((option) => option.value === "Won")?.isActive, false);

  const labels = normalizeLabelsUpdate({ ctaAddSalesRecord: "Log a new lead" });
  assert.equal(labels.ctaAddSalesRecord, "Log a new lead");
  assert.equal(labels.tabOverview, "Overview");
});
