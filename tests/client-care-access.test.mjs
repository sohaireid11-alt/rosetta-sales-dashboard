import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";

const files = {
  followUps: new URL("../app/api/client-follow-ups/route.ts", import.meta.url),
  followUpId: new URL("../app/api/client-follow-ups/[id]/route.ts", import.meta.url),
  followUpUtils: new URL("../app/api/client-follow-ups/client-follow-up-utils.ts", import.meta.url),
  deals: new URL("../app/api/deals/route.ts", import.meta.url),
  team: new URL("../app/api/team-members/route.ts", import.meta.url),
  home: new URL("../app/page.tsx", import.meta.url),
};

function handlerSource(source, name, nextName) {
  const start = source.indexOf(`export async function ${name}`);
  assert.notEqual(start, -1, `missing ${name} handler`);
  const end = nextName ? source.indexOf(`export async function ${nextName}`, start + 1) : source.length;
  return source.slice(start, end === -1 ? source.length : end);
}

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

test("GET /api/client-follow-ups allows every signed-in dashboard role", async () => {
  const [followUps, followUpId, deals, team] = await Promise.all([
    readFile(files.followUps, "utf8"),
    readFile(files.followUpId, "utf8"),
    readFile(files.deals, "utf8"),
    readFile(files.team, "utf8"),
  ]);

  const getFollowUps = handlerSource(followUps, "GET", "POST");
  const postFollowUps = handlerSource(followUps, "POST");
  const getDeals = handlerSource(deals, "GET", "POST");

  assert.match(getFollowUps, /requireRole\(request, \["admin", "contributor"\]\)/);
  assert.match(getFollowUps, /ensureWonClientFollowUps\(\{ actor: user \}\)/);
  assert.match(getFollowUps, /Backfill is best-effort/);
  assert.ok(
    getFollowUps.indexOf("ensureWonClientFollowUps") < getFollowUps.indexOf("listClientFollowUps"),
    "GET must backfill before listing so new Won rows appear, and still list if backfill throws"
  );
  assert.match(postFollowUps, /requireRole\(request, \["admin", "contributor"\]\)/);
  assert.match(getDeals, /requireRole\(request, \["admin", "contributor"\]\)/);
  assert.match(team, /requireRole\(request, \["admin", "contributor"\]\)/);
  assert.match(handlerSource(followUpId, "PATCH", "DELETE"), /requireRole\(request, \["admin", "contributor"\]\)/);
  assert.match(handlerSource(followUpId, "DELETE"), /requireRole\(request, \["admin", "contributor"\]\)/);
});

test("dashboard loads Client Care for admins and contributors and surfaces care API errors", async () => {
  const home = await readFile(files.home, "utf8");

  assert.match(home, /if \(access\?\.user\) void loadWorkspace\(\)/);
  assert.doesNotMatch(home, /access\?\.user\?\.role === "admin"\) void loadWorkspace/);
  assert.doesNotMatch(home, /role === "contributor"\) return <ContributorForm/);
  assert.match(home, /if \(!clientResponse\.ok\) throw new Error\(clientPayload\.error \?\? "Unable to load client-care records\."\)/);
  assert.match(home, /labels\.tabClientCare/);
});

test("listClientFollowUps qualifies next_follow_up_at so the sales_records join is not ambiguous", async () => {
  const utils = await readFile(files.followUpUtils, "utf8");
  const selectColumns = quotedBlock(utils, "selectColumns");
  const followUpJoin = quotedString(utils, "followUpJoin");
  const followUpListOrder = quotedString(utils, "followUpListOrder");

  assert.match(utils, /export async function listClientFollowUps/);
  assert.doesNotMatch(handlerSource(utils, "listClientFollowUps", "findClientFollowUpBySalesRecordId"), /WHERE /);
  assert.match(handlerSource(utils, "listClientFollowUps", "findClientFollowUpBySalesRecordId"), /result\.results \?\? \[\]/);
  assert.doesNotMatch(followUpListOrder, /(?<!client_follow_ups\.)next_follow_up_at/);
  assert.match(followUpListOrder, /client_follow_ups\.next_follow_up_at IS NULL/);
  assert.match(followUpListOrder, /client_follow_ups\.next_follow_up_at ASC/);
  assert.match(selectColumns, /client_follow_ups\.next_follow_up_at AS nextFollowUpAt/);
  assert.match(selectColumns, /sales_records\.stage AS status/);

  const db = new DatabaseSync(":memory:");
  db.exec(`
    CREATE TABLE sales_records (
      id INTEGER PRIMARY KEY,
      lead_name TEXT,
      stage TEXT,
      next_follow_up_at TEXT,
      next_action TEXT,
      created_at TEXT
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
    INSERT INTO sales_records (id, lead_name, stage, next_follow_up_at, next_action, created_at)
    VALUES (1, 'Won Lead', 'Won', '2026-01-02', 'Call', '2026-01-01');
    INSERT INTO client_follow_ups (
      id, sales_record_id, client_name, relationship_type, last_engagement_at, last_check_in_at,
      satisfaction_status, next_follow_up_at, next_action, expansion_opportunity, created_at, updated_at
    ) VALUES (1, 1, 'Won Lead', 'Recurring client', NULL, NULL, 'Healthy', '2026-09-10', '', '', '2026-01-01', '2026-01-01');
    INSERT INTO client_follow_ups (
      id, sales_record_id, client_name, relationship_type, last_engagement_at, last_check_in_at,
      satisfaction_status, next_follow_up_at, next_action, expansion_opportunity, created_at, updated_at
    ) VALUES (2, NULL, 'Unlinked Client', 'Recurring client', NULL, NULL, 'Healthy', NULL, '', '', '2026-01-01', '2026-01-01');
  `);

  const unqualifiedOrder = "ORDER BY CASE WHEN next_follow_up_at IS NULL THEN 1 ELSE 0 END, next_follow_up_at ASC, client_follow_ups.id DESC";
  assert.throws(
    () => db.prepare(`SELECT ${selectColumns} ${followUpJoin} ${unqualifiedOrder}`).all(),
    /ambiguous column name/i
  );

  const rows = db.prepare(`SELECT ${selectColumns} ${followUpJoin} ${followUpListOrder}`).all();
  assert.equal(rows.length, 2);
  const linked = rows.find((row) => row.clientName === "Won Lead");
  const unlinked = rows.find((row) => row.clientName === "Unlinked Client");
  assert.equal(linked.linkedLeadName, "Won Lead");
  assert.equal(linked.nextFollowUpAt, "2026-09-10");
  assert.equal(linked.status, "Won");
  assert.equal(unlinked.linkedLeadName, null);
  assert.equal(unlinked.status, null);
});
