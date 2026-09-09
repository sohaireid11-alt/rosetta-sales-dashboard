import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const files = {
  salesConfig: new URL("../app/sales-config.ts", import.meta.url),
  core: new URL("../app/lib/field-settings-core.ts", import.meta.url),
  api: new URL("../app/api/field-settings/route.ts", import.meta.url),
  page: new URL("../app/field-settings/page.tsx", import.meta.url),
  home: new URL("../app/page.tsx", import.meta.url),
  team: new URL("../app/team/page.tsx", import.meta.url),
  contributor: new URL("../app/contributor-form.tsx", import.meta.url),
  schemaField: new URL("../app/schema-field.tsx", import.meta.url),
  menu: new URL("../app/settings-menu.tsx", import.meta.url),
  catalog: new URL("../app/admin-catalog.ts", import.meta.url),
  access: new URL("../app/lib/access.ts", import.meta.url),
};

const NEW_LABEL_KEYS = [
  "recordsSortLabel",
  "recordsSortName",
  "recordsSortDate",
  "recordsSortStatus",
  "recordsFiltersLabel",
  "recordsFilterName",
  "recordsFilterDate",
  "recordsFilterStatus",
  "recordsFilterAllStatuses",
  "filterAllOwners",
  "recordsSingular",
  "recordsPlural",
  "actionActivity",
  "actionEdit",
  "actionMerge",
  "actionDelete",
  "importingCsv",
  "exportingCsv",
  "lastServicePrefix",
  "mergeEyebrow",
  "hiddenOptionSuffix",
  "emptyFieldOptions",
  "contributorSignedInAs",
  "requestReceivedFallback",
  "noticeLeadStatusUpdated",
  "noticeLeadStatusLeftCare",
  "teamRoleAdminShort",
  "teamRoleContributorShort",
  "teamLastSignInPrefix",
];

function extractArray(source, name) {
  const match = source.match(new RegExp(`export const ${name} = \\[([\\s\\S]*?)\\] as const;`));
  assert.ok(match, `missing ${name}`);
  return [...match[1].matchAll(/"([^"]+)"/g)].map((item) => item[1]);
}

function extractRecordKeys(source, name) {
  const match = source.match(new RegExp(`export const ${name}: Record<[^>]+> = \\{([\\s\\S]*?)\\n\\};`));
  assert.ok(match, `missing ${name}`);
  return [...match[1].matchAll(/^\s{2}([A-Za-z][A-Za-z0-9]*):/gm)].map((item) => item[1]);
}

test("new editable keys exist in the Field Settings catalog", async () => {
  const salesConfig = await readFile(files.salesConfig, "utf8");
  const keys = extractArray(salesConfig, "UI_LABEL_KEYS");
  const defaults = extractRecordKeys(salesConfig, "DEFAULT_UI_LABELS");
  const meta = extractRecordKeys(salesConfig, "UI_LABEL_META");
  const keySet = new Set(keys);

  assert.deepEqual(new Set(defaults), keySet);
  assert.deepEqual(new Set(meta), keySet);
  for (const key of NEW_LABEL_KEYS) {
    assert.ok(keySet.has(key), `missing catalog key ${key}`);
    assert.match(salesConfig, new RegExp(`${key}: "`));
    assert.match(salesConfig, new RegExp(`${key}: \\{ group:`));
  }
  assert.match(salesConfig, /recordsSortLabel: "Sort"/);
  assert.match(salesConfig, /recordsFiltersLabel: "Filters"/);
  assert.match(salesConfig, /recordsFilterAllStatuses: "All statuses"/);
  assert.match(salesConfig, /recordsSortStatus: "Status"/);
  assert.match(salesConfig, /recordsFilterStatus: "Status"/);
});

test("field-settings writes are admin-only and not email-gated", async () => {
  const [api, page, menu, access] = await Promise.all([
    readFile(files.api, "utf8"),
    readFile(files.page, "utf8"),
    readFile(files.menu, "utf8"),
    readFile(files.access, "utf8"),
  ]);

  assert.match(api, /requireRole\(request, \["admin", "contributor"\]\)/);
  assert.match(api, /requireRole\(request, \["admin"\]\)/);
  assert.match(api, /export async function PATCH/);
  assert.match(api, /export async function PUT/);
  assert.doesNotMatch(api, /sohair@rosettalanguages\.org/);
  assert.doesNotMatch(api, /fady@rosettalanguages\.org/);
  assert.doesNotMatch(api, /danyal@rosettalanguages\.org/);
  assert.doesNotMatch(page, /sohair@rosettalanguages\.org/);
  assert.match(page, /access\.user\?\.role !== "admin"/);
  assert.match(menu, /isAdmin \? <a role="menuitem" href="\/admin">/);
  assert.match(access, /if \(value === "admin" \|\| value === "contributor"\) return value;/);
  assert.match(access, /if \(!roles.includes\(user.role\)\)/);
});

test("Sort, Filters, and Status labels come from settings, not literals", async () => {
  const [home, salesConfig, page] = await Promise.all([
    readFile(files.home, "utf8"),
    readFile(files.salesConfig, "utf8"),
    readFile(files.page, "utf8"),
  ]);

  assert.match(home, /labels.recordsSortLabel/);
  assert.match(home, /labels.recordsSortName/);
  assert.match(home, /labels.recordsSortDate/);
  assert.match(home, /labels.recordsSortStatus/);
  assert.match(home, /labels.recordsFiltersLabel/);
  assert.match(home, /labels.recordsFilterName/);
  assert.match(home, /labels.recordsFilterDate/);
  assert.match(home, /labels.recordsFilterStatus/);
  assert.match(home, /labels.recordsFilterAllStatuses/);
  assert.match(home, /visibleOptions\(lists.statuses\)/);
  assert.match(home, /columnLabel\(fieldSettings, "client_care", "status"/);
  assert.match(home, /visibleOptions\(lists.statuses, item.status\)/);
  assert.doesNotMatch(home, /<option value="name">Name<\/option>/);
  assert.doesNotMatch(home, /<option value="status">Status<\/option>/);
  assert.doesNotMatch(home, />All statuses</);
  assert.doesNotMatch(home, /aria-labelledby="records-filters-label">[\s\S]*Filters</);
  assert.match(salesConfig, /group: "salesRecords", title: "Sort control label"/);
  assert.match(salesConfig, /Choices come from Lead statuses/);
  assert.match(page, /UI_LABEL_KEYS.filter/);
  assert.match(page, /Rename Sort, Filters, or Status/);
});

test("row actions, notices, and team chrome use Field Settings labels", async () => {
  const [home, team, contributor, schemaField, catalog] = await Promise.all([
    readFile(files.home, "utf8"),
    readFile(files.team, "utf8"),
    readFile(files.contributor, "utf8"),
    readFile(files.schemaField, "utf8"),
    readFile(files.catalog, "utf8"),
  ]);

  assert.match(home, /labels.actionActivity/);
  assert.match(home, /labels.actionEdit/);
  assert.match(home, /labels.actionMerge/);
  assert.match(home, /labels.actionDelete/);
  assert.match(home, /labels.importingCsv/);
  assert.match(home, /labels.exportingCsv/);
  assert.match(home, /labels.lastServicePrefix/);
  assert.match(home, /labels.filterAllOwners/);
  assert.match(home, /labels.mergeEyebrow/);
  assert.match(home, /fieldSettings.labels.noticeLeadStatusUpdated/);
  assert.match(home, /fieldSettings.labels.noticeLeadStatusLeftCare/);
  assert.doesNotMatch(home, />Activity</);
  assert.doesNotMatch(home, />Importing\.\.\.</);
  assert.doesNotMatch(home, /Last service:/);
  assert.match(team, /labels.teamRoleAdminShort/);
  assert.match(team, /labels.teamRoleContributorShort/);
  assert.match(team, /labels.teamLastSignInPrefix/);
  assert.doesNotMatch(team, /"Administrator"/);
  assert.doesNotMatch(team, /Last sign-in /);
  assert.match(contributor, /labels.contributorSignedInAs/);
  assert.match(contributor, /labels.requestReceivedFallback/);
  assert.match(schemaField, /hiddenOptionSuffix/);
  assert.match(schemaField, /emptyOptionsMessage/);
  assert.match(catalog, /Worker secrets and OAuth client IDs/);
  assert.match(catalog, /Admin Control Center chrome/);
});
