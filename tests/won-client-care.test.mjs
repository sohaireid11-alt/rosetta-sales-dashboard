import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";

const files = {
  schema: new URL("../db/schema.ts", import.meta.url),
  migration: new URL("../drizzle/0010_won_leads_client_care.sql", import.meta.url),
  journal: new URL("../drizzle/meta/_journal.json", import.meta.url),
  salesConfig: new URL("../app/sales-config.ts", import.meta.url),
  core: new URL("../app/lib/field-settings-core.ts", import.meta.url),
  utils: new URL("../app/api/field-settings/field-settings-utils.ts", import.meta.url),
  settingsApi: new URL("../app/api/field-settings/route.ts", import.meta.url),
  admin: new URL("../app/field-settings/page.tsx", import.meta.url),
  home: new URL("../app/page.tsx", import.meta.url),
  followUps: new URL("../app/api/client-follow-ups/route.ts", import.meta.url),
  followUpUtils: new URL("../app/api/client-follow-ups/client-follow-up-utils.ts", import.meta.url),
  wonCare: new URL("../app/api/client-follow-ups/won-client-care.ts", import.meta.url),
  deals: new URL("../app/api/deals/route.ts", import.meta.url),
  dealId: new URL("../app/api/deals/[id]/route.ts", import.meta.url),
  merge: new URL("../app/api/deals/[id]/merge/route.ts", import.meta.url),
  recordUtils: new URL("../app/api/deals/record-utils.ts", import.meta.url),
  importRoute: new URL("../app/api/deals/import/route.ts", import.meta.url),
  readme: new URL("../README.md", import.meta.url),
};

const OPPORTUNITY_TO_RELATIONSHIP = {
  "One-time project": "One-time client",
  "Recurring client": "Recurring client",
  "Ongoing vendor relationship": "Ongoing vendor relationship",
};

function includesChoice(raw, choice) {
  if (raw === choice) return true;
  if (typeof raw !== "string") return false;
  if (raw.startsWith("[")) {
    try {
      return JSON.parse(raw).includes(choice);
    } catch {
      return false;
    }
  }
  return false;
}

function careDateFromRecord(value) {
  const text = typeof value === "string" ? value.trim().slice(0, 10) : "";
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : null;
}

function relationshipTypeForWonLead(opportunityType, relationshipTypes) {
  const preferred = OPPORTUNITY_TO_RELATIONSHIP[opportunityType] ?? "Recurring client";
  if (relationshipTypes.includes(preferred)) return preferred;
  return relationshipTypes[0] ?? "Recurring client";
}

function defaultSatisfactionStatus(statuses) {
  if (statuses.includes("Healthy")) return "Healthy";
  return statuses[0] ?? "Healthy";
}

function defaultCareNextAction(actions) {
  return actions.includes("Client check-in") ? "Client check-in" : "";
}

function careInputFromWonLead(record, lists) {
  return {
    salesRecordId: record.id,
    clientName: record.leadName,
    relationshipType: relationshipTypeForWonLead(record.opportunityType, lists.relationshipTypes),
    lastEngagementAt: careDateFromRecord(record.closedAt) ?? careDateFromRecord(record.createdAt),
    lastCheckInAt: null,
    satisfactionStatus: defaultSatisfactionStatus(lists.satisfactionStatuses),
    nextFollowUpAt: null,
    nextAction: defaultCareNextAction(lists.followUpActions),
    expansionOpportunity: "",
  };
}

function missingWonLeads(records, followUps) {
  const linked = new Set(followUps.map((item) => item.salesRecordId).filter(Boolean));
  return records.filter((record) => includesChoice(record.stage, "Won") && !linked.has(record.id));
}

function linkedCareRowsLeavingWon(rows) {
  return rows.filter((row) => row.salesRecordId != null && !includesChoice(row.stage, "Won"));
}

test("maps Won sales records onto client-care rows without duplicating links", () => {
  const lists = {
    relationshipTypes: ["One-time client", "Recurring client", "Ongoing vendor relationship"],
    satisfactionStatuses: ["Healthy", "Needs attention", "At risk"],
    followUpActions: ["Call", "Client check-in", "Email"],
  };
  const oneTime = careInputFromWonLead(
    { id: 12, leadName: "Cairo Clinic", opportunityType: "One-time project", closedAt: "2026-09-01", createdAt: "2026-08-01" },
    lists
  );
  assert.equal(oneTime.salesRecordId, 12);
  assert.equal(oneTime.clientName, "Cairo Clinic");
  assert.equal(oneTime.relationshipType, "One-time client");
  assert.equal(oneTime.lastEngagementAt, "2026-09-01");
  assert.equal(oneTime.lastCheckInAt, null);
  assert.equal(oneTime.satisfactionStatus, "Healthy");
  assert.equal(oneTime.nextFollowUpAt, null);
  assert.equal(oneTime.nextAction, "Client check-in");
  assert.equal(oneTime.expansionOpportunity, "");

  const recurring = careInputFromWonLead(
    { id: 13, leadName: "City Hall", opportunityType: "Recurring client", closedAt: null, createdAt: "2026-07-15T12:00:00.000Z" },
    lists
  );
  assert.equal(recurring.relationshipType, "Recurring client");
  assert.equal(recurring.lastEngagementAt, "2026-07-15");

  const missing = missingWonLeads(
    [
      { id: 1, stage: "Won" },
      { id: 2, stage: "Won" },
      { id: 3, stage: "Pending" },
      { id: 4, stage: "Lost" },
      { id: 5, stage: '["Won"]' },
    ],
    [{ salesRecordId: 1 }, { salesRecordId: null }]
  );
  assert.deepEqual(missing.map((record) => record.id), [2, 5]);
});

test("adds a unique sales-record link and backfills existing Won deals", async () => {
  const [schema, migration, journal, readme] = await Promise.all([
    readFile(files.schema, "utf8"),
    readFile(files.migration, "utf8"),
    readFile(files.journal, "utf8"),
    readFile(files.readme, "utf8"),
  ]);

  assert.match(schema, /uniqueIndex\("idx_client_follow_ups_sales_record_id"\)/);
  assert.match(migration, /CREATE UNIQUE INDEX `idx_client_follow_ups_sales_record_id`/);
  assert.match(migration, /WHERE `sales_records`.`stage` = 'Won'/);
  assert.match(migration, /INSERT INTO `client_follow_ups`/);
  assert.match(migration, /SET `sales_record_id` = NULL/);
  assert.match(journal, /0010_won_leads_client_care/);
  assert.match(readme, /0010_won_leads_client_care/);
  assert.match(readme, /idempotently creates missing Won-lead care rows/);
});

test("admins can turn Won-lead Client care on or off without code", async () => {
  const [salesConfig, core, utils, settingsApi, admin, home] = await Promise.all([
    readFile(files.salesConfig, "utf8"),
    readFile(files.core, "utf8"),
    readFile(files.utils, "utf8"),
    readFile(files.settingsApi, "utf8"),
    readFile(files.admin, "utf8"),
    readFile(files.home, "utf8"),
  ]);

  assert.match(salesConfig, /DEFAULT_INCLUDE_WON_LEADS_IN_CLIENT_CARE = true/);
  assert.match(salesConfig, /wonLeadsInClientCareLabel: "Show \/ auto-add Won leads in Client Care"/);
  assert.match(salesConfig, /careWonLeadsNote/);
  assert.match(core, /includeWonLeadsInClientCare/);
  assert.match(core, /DEFAULT_INCLUDE_WON_LEADS_IN_CLIENT_CARE/);
  assert.match(utils, /includeWonLeadsInClientCare/);
  assert.match(settingsApi, /includeWonLeadsInClientCare/);
  assert.match(settingsApi, /ensureWonClientFollowUps/);
  assert.match(admin, /draft.includeWonLeadsInClientCare/);
  assert.match(admin, /draft.labels.wonLeadsInClientCareLabel/);
  assert.match(admin, /Won-lead Client care/);
  assert.match(home, /fieldSettings.includeWonLeadsInClientCare/);
  assert.match(home, /labels.careWonLeadsNote/);
  assert.match(home, /linkedElsewhere/);
});

test("auto-creates care rows for Won leads and removes them when the lead leaves Won", async () => {
  const [wonCare, followUps, followUpUtils, deals, dealId, merge, recordUtils, importRoute, salesConfig, readme, home] = await Promise.all([
    readFile(files.wonCare, "utf8"),
    readFile(files.followUps, "utf8"),
    readFile(files.followUpUtils, "utf8"),
    readFile(files.deals, "utf8"),
    readFile(files.dealId, "utf8"),
    readFile(files.merge, "utf8"),
    readFile(files.recordUtils, "utf8"),
    readFile(files.importRoute, "utf8"),
    readFile(files.salesConfig, "utf8"),
    readFile(files.readme, "utf8"),
    readFile(files.home, "utf8"),
  ]);

  assert.match(wonCare, /if \(!settings.includeWonLeadsInClientCare\) return \{ created: 0, removed: 0 \}/);
  assert.match(wonCare, /INSERT OR IGNORE INTO client_follow_ups/);
  assert.match(wonCare, /isWonStage\(record.stage\)/);
  assert.doesNotMatch(wonCare, /stage = \?/);
  assert.match(wonCare, /NOT EXISTS \(SELECT 1 FROM client_follow_ups WHERE client_follow_ups.sales_record_id = sales_records.id\)/);
  assert.match(wonCare, /added client-care record/);
  assert.match(wonCare, /nextFollowUpAt: null/);
  assert.match(wonCare, /return \{ created: 0, removed: 0 \}/);
  assert.match(wonCare, /DELETE FROM client_follow_ups WHERE id = \?/);
  assert.match(wonCare, /linkedCareRowsLeavingWon/);
  assert.match(wonCare, /deleteFollowUpCalendarSafe\("client_follow_up"/);
  assert.match(wonCare, /because the lead left Won/);
  assert.match(wonCare, /INNER JOIN sales_records ON sales_records.id = client_follow_ups.sales_record_id/);
  assert.match(salesConfig, /Client Care stays Won-only/);
  assert.match(salesConfig, /Changing a lead away from Won removes that care record/);
  assert.doesNotMatch(salesConfig, /does not remove this care record/);
  assert.match(readme, /Client Care stays Won-only/);
  assert.match(readme, /stops auto-removes/);
  assert.match(followUps, /ensureWonClientFollowUps\(\{ actor: user \}\)/);
  assert.match(followUps, /return Response.json\(\{ followUp: null \}/);
  assert.match(followUpUtils, /This won lead already has a client-care record/);
  assert.match(deals, /ensureWonClientFollowUps\(\{ actor: user, salesRecordId: record.id \}\)/);
  assert.match(dealId, /ensureWonClientFollowUps\(\{ actor: user, salesRecordId: record.id \}\)/);
  assert.match(merge, /ensureWonClientFollowUps\(\{ actor: user, salesRecordId: record.id \}\)/);
  assert.match(importRoute, /ensureWonClientFollowUps\(\{ actor: user \}\)/);
  assert.match(recordUtils, /reassignClientFollowUpsOnMerge/);
  assert.match(recordUtils, /SET sales_record_id = NULL/);
  assert.doesNotMatch(dealId, /DELETE FROM client_follow_ups WHERE sales_record_id/);
  assert.match(home, /followUp == null \? "Lead status updated. This client left Client Care because the lead is no longer Won."/);

  const stale = linkedCareRowsLeavingWon([
    { id: 1, salesRecordId: 10, stage: "Lost" },
    { id: 2, salesRecordId: 11, stage: "Won" },
    { id: 3, salesRecordId: 12, stage: '["Pending"]' },
    { id: 4, salesRecordId: null, stage: "Lost" },
    { id: 5, salesRecordId: 13, stage: '["Won"]' },
  ]);
  assert.deepEqual(stale.map((row) => row.id), [1, 3]);
});

test("Won-only cleanup deletes linked non-Won care rows and keeps unlinked rows", () => {
  const db = new DatabaseSync(":memory:");
  db.exec(`
    CREATE TABLE sales_records (id INTEGER PRIMARY KEY, stage TEXT, next_follow_up_at TEXT);
    CREATE TABLE client_follow_ups (
      id INTEGER PRIMARY KEY,
      sales_record_id INTEGER,
      client_name TEXT,
      next_follow_up_at TEXT
    );
    INSERT INTO sales_records (id, stage, next_follow_up_at) VALUES
      (1, 'Won', '2026-03-01'),
      (2, 'Lost', '2026-03-02'),
      (3, '["Pending"]', '2026-03-03');
    INSERT INTO client_follow_ups (id, sales_record_id, client_name, next_follow_up_at) VALUES
      (10, 1, 'Keep Won', '2026-10-01'),
      (11, 2, 'Remove Lost', '2026-10-02'),
      (12, 3, 'Remove Pending', '2026-10-03'),
      (13, NULL, 'Keep unlinked', '2026-10-04');
  `);

  const rows = db.prepare(`SELECT client_follow_ups.id, client_follow_ups.client_name AS clientName,
         client_follow_ups.sales_record_id AS salesRecordId, sales_records.stage AS stage
         FROM client_follow_ups
         INNER JOIN sales_records ON sales_records.id = client_follow_ups.sales_record_id`).all();
  const stale = linkedCareRowsLeavingWon(rows);
  assert.deepEqual(stale.map((row) => row.id).sort((a, b) => a - b), [11, 12]);
  for (const row of stale) {
    db.prepare("DELETE FROM client_follow_ups WHERE id = ?").run(row.id);
  }
  const remaining = db.prepare("SELECT id FROM client_follow_ups ORDER BY id").all().map((row) => row.id);
  assert.deepEqual(remaining, [10, 13]);
});
