import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";

const files = {
  catalog: new URL("../app/admin-catalog.ts", import.meta.url),
  salesConfig: new URL("../app/sales-config.ts", import.meta.url),
  followUpUtils: new URL("../app/api/client-follow-ups/client-follow-up-utils.ts", import.meta.url),
  followUps: new URL("../app/api/client-follow-ups/route.ts", import.meta.url),
  followUpId: new URL("../app/api/client-follow-ups/[id]/route.ts", import.meta.url),
  recordUtils: new URL("../app/api/deals/record-utils.ts", import.meta.url),
  settingsUtils: new URL("../app/api/field-settings/field-settings-utils.ts", import.meta.url),
  home: new URL("../app/page.tsx", import.meta.url),
  settingsPage: new URL("../app/field-settings/page.tsx", import.meta.url),
};

function quotedBlock(source, name) {
  const marker = `const ${name} = \``;
  const start = source.indexOf(marker);
  assert.notEqual(start, -1, `missing ${name}`);
  const from = start + marker.length;
  const end = source.indexOf("`;", from);
  assert.notEqual(end, -1, `unterminated ${name}`);
  return source.slice(from, end).trim();
}

function quotedString(source, name) {
  const marker = `const ${name} = "`;
  const start = source.indexOf(marker);
  assert.notEqual(start, -1, `missing ${name}`);
  const from = start + marker.length;
  const end = source.indexOf('";', from);
  assert.notEqual(end, -1, `unterminated ${name}`);
  return source.slice(from, end);
}

test("Client Care Status column is admin-editable and uses the sales stage picklist", async () => {
  const [catalog, salesConfig, settingsUtils, settingsPage, home] = await Promise.all([
    readFile(files.catalog, "utf8"),
    readFile(files.salesConfig, "utf8"),
    readFile(files.settingsUtils, "utf8"),
    readFile(files.settingsPage, "utf8"),
    readFile(files.home, "utf8"),
  ]);

  assert.match(catalog, /viewKey: "client_care", columnKey: "status", label: "Status"/);
  assert.match(catalog, /field\("status", "client_follow_up"/);
  assert.match(catalog, /listKey: "statuses"/);
  assert.match(salesConfig, /Client Care Status column/);
  assert.match(settingsUtils, /seedViewColumns/);
  assert.match(settingsUtils, /sort_order = sort_order \+ 1/);
  assert.match(settingsUtils, /missing = defaults\[viewKey\]\.filter/);
  assert.match(settingsPage, /VIEW_KEYS\.map/);
  assert.match(settingsPage, /column\.label/);
  assert.match(settingsPage, /Show column/);
  assert.match(home, /columnVisible\(fieldSettings, "client_care", "status"\)/);
  assert.match(home, /columnLabel\(fieldSettings, "client_care", "status", "Status"\)/);
  assert.match(home, /saveClientCareStatus/);
  assert.match(home, /visibleOptions\(lists\.statuses, item\.status\)/);
  assert.match(home, /field\.fieldKey === "status" \? !isAdmin \|\| !clientForm\.salesRecordId/);
});

test("list payload includes linked lead status and keeps join columns qualified", async () => {
  const utils = await readFile(files.followUpUtils, "utf8");
  const selectColumns = quotedBlock(utils, "selectColumns");
  const followUpJoin = quotedString(utils, "followUpJoin");
  const followUpListOrder = quotedString(utils, "followUpListOrder");

  assert.match(selectColumns, /sales_records\.stage AS status/);
  assert.doesNotMatch(selectColumns, /(?<!sales_records\.)stage AS status/);
  assert.match(followUpListOrder, /client_follow_ups\.next_follow_up_at/);
  assert.doesNotMatch(followUpListOrder, /(?<!client_follow_ups\.)next_follow_up_at/);
  assert.doesNotMatch(utils, /INSERT INTO client_follow_ups \([^)]*\bstatus\b/);
  assert.doesNotMatch(utils, /UPDATE client_follow_ups SET[^;]*\bstatus = \?/);

  const db = new DatabaseSync(":memory:");
  db.exec(`
    CREATE TABLE sales_records (
      id INTEGER PRIMARY KEY,
      lead_name TEXT,
      stage TEXT,
      next_follow_up_at TEXT,
      next_action TEXT
    );
    CREATE TABLE client_follow_ups (
      id INTEGER PRIMARY KEY,
      sales_record_id INTEGER,
      client_name TEXT,
      relationship_type TEXT,
      last_engagement_at TEXT,
      last_check_in_at TEXT,
      satisfaction_status TEXT,
      next_follow_up_at TEXT,
      next_action TEXT,
      expansion_opportunity TEXT,
      created_at TEXT,
      updated_at TEXT
    );
    INSERT INTO sales_records (id, lead_name, stage, next_follow_up_at, next_action)
    VALUES (7, 'Harbor School', 'Won', '2026-02-01', 'Email');
    INSERT INTO client_follow_ups (
      id, sales_record_id, client_name, relationship_type, last_engagement_at, last_check_in_at,
      satisfaction_status, next_follow_up_at, next_action, expansion_opportunity, created_at, updated_at
    ) VALUES (3, 7, 'Harbor School', 'Recurring client', NULL, NULL, 'Healthy', '2026-10-01', '', '', '2026-02-01', '2026-02-01');
    INSERT INTO client_follow_ups (
      id, sales_record_id, client_name, relationship_type, last_engagement_at, last_check_in_at,
      satisfaction_status, next_follow_up_at, next_action, expansion_opportunity, created_at, updated_at
    ) VALUES (4, NULL, 'No Lead', 'One-time client', NULL, NULL, 'Healthy', NULL, '', '', '2026-02-01', '2026-02-01');
  `);

  const unqualifiedOrder = "ORDER BY CASE WHEN next_follow_up_at IS NULL THEN 1 ELSE 0 END, next_follow_up_at ASC, client_follow_ups.id DESC";
  assert.throws(
    () => db.prepare(`SELECT ${selectColumns} ${followUpJoin} ${unqualifiedOrder}`).all(),
    /ambiguous column name/i
  );

  const rows = db.prepare(`SELECT ${selectColumns} ${followUpJoin} ${followUpListOrder}`).all();
  const linked = rows.find((row) => row.id === 3);
  const unlinked = rows.find((row) => row.id === 4);
  assert.equal(linked.status, "Won");
  assert.equal(linked.linkedLeadName, "Harbor School");
  assert.equal(unlinked.status, null);
  assert.equal(unlinked.linkedLeadName, null);
});

test("editing Client Care Status updates the linked sales lead stage", async () => {
  const [recordUtils, followUpUtils, followUps, followUpId] = await Promise.all([
    readFile(files.recordUtils, "utf8"),
    readFile(files.followUpUtils, "utf8"),
    readFile(files.followUps, "utf8"),
    readFile(files.followUpId, "utf8"),
  ]);

  const updateSql = quotedString(recordUtils, "updateLinkedLeadStageSql");
  assert.match(recordUtils, /export async function updateLinkedLeadStage/);
  assert.match(recordUtils, /Pending leads need an action and a date of next follow-up/);
  assert.match(recordUtils, /includesChoice\(stage, WON_STAGE\) \? record\.estimatedRevenueCents : 0/);
  assert.match(followUpUtils, /function canWriteLinkedLeadStatus/);
  assert.match(followUpUtils, /return role === "admin"/);
  assert.match(followUpUtils, /applyLinkedLeadStatusFromCare/);
  assert.match(followUps, /applyLinkedLeadStatusFromCare\(followUp\.salesRecordId, input\.status, user\.role\)/);
  assert.match(followUpId, /applyLinkedLeadStatusFromCare\(followUp\.salesRecordId, input\.status, user\.role\)/);
  assert.match(followUpId, /ensureWonClientFollowUps\(\{ actor: user, salesRecordId: record\.id \}\)/);
  assert.match(followUps, /ensureWonClientFollowUps\(\{ actor: user, salesRecordId: record\.id \}\)/);
  assert.match(followUpId, /return Response.json\(\{ followUp: null \}\)/);
  assert.match(followUps, /return Response.json\(\{ followUp: null \}/);
  assert.match(followUpId, /syncSalesFollowUpCalendar\(record\)/);

  const db = new DatabaseSync(":memory:");
  db.exec(`
    CREATE TABLE sales_records (
      id INTEGER PRIMARY KEY,
      stage TEXT,
      estimated_revenue_cents INTEGER,
      booked_revenue_cents INTEGER,
      next_follow_up_at TEXT,
      next_action TEXT
    );
    INSERT INTO sales_records (id, stage, estimated_revenue_cents, booked_revenue_cents, next_follow_up_at, next_action)
    VALUES (9, 'Won', 250000, 250000, NULL, '');
  `);

  db.prepare(updateSql).run("Lost", 0, 9);
  const lost = db.prepare("SELECT stage, booked_revenue_cents AS booked FROM sales_records WHERE id = 9").get();
  assert.equal(lost.stage, "Lost");
  assert.equal(lost.booked, 0);

  db.prepare(updateSql).run("Won", 250000, 9);
  const won = db.prepare("SELECT stage, booked_revenue_cents AS booked FROM sales_records WHERE id = 9").get();
  assert.equal(won.stage, "Won");
  assert.equal(won.booked, 250000);
});
