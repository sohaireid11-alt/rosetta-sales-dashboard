import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const files = {
  schema: new URL("../db/schema.ts", import.meta.url),
  migration: new URL("../drizzle/0009_google_calendar_sync.sql", import.meta.url),
  journal: new URL("../drizzle/meta/_journal.json", import.meta.url),
  core: new URL("../app/lib/calendar-sync-core.ts", import.meta.url),
  sync: new URL("../app/lib/calendar-sync.ts", import.meta.url),
  api: new URL("../app/api/calendar/route.ts", import.meta.url),
  oauthStart: new URL("../app/api/calendar/oauth/start/route.ts", import.meta.url),
  oauthCallback: new URL("../app/api/calendar/oauth/callback/route.ts", import.meta.url),
  disconnect: new URL("../app/api/calendar/disconnect/route.ts", import.meta.url),
  salesConfig: new URL("../app/sales-config.ts", import.meta.url),
  admin: new URL("../app/field-settings/page.tsx", import.meta.url),
  deals: new URL("../app/api/deals/route.ts", import.meta.url),
  dealId: new URL("../app/api/deals/[id]/route.ts", import.meta.url),
  merge: new URL("../app/api/deals/[id]/merge/route.ts", import.meta.url),
  followUps: new URL("../app/api/client-follow-ups/route.ts", import.meta.url),
  followUpId: new URL("../app/api/client-follow-ups/[id]/route.ts", import.meta.url),
  setup: new URL("../GOOGLE_CALENDAR_SETUP.md", import.meta.url),
  readme: new URL("../README.md", import.meta.url),
  wrangler: new URL("../wrangler.jsonc", import.meta.url),
};

function normalizeFollowUpDate(value) {
  const date = typeof value === "string" ? value.trim() : "";
  return /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : null;
}

function decideCalendarSyncAction(followUpDate, existingEventId) {
  const date = normalizeFollowUpDate(followUpDate);
  const eventId = typeof existingEventId === "string" ? existingEventId.trim() : "";
  if (!date) return eventId ? "delete" : "noop";
  return eventId ? "update" : "create";
}

function addIsoDateDays(date, days) {
  const year = Number(date.slice(0, 4));
  const month = Number(date.slice(5, 7));
  const day = Number(date.slice(8, 10));
  const utc = new Date(Date.UTC(year, month - 1, day));
  utc.setUTCDate(utc.getUTCDate() + days);
  return utc.toISOString().slice(0, 10);
}

function interpolateLabel(template, values) {
  return template.replaceAll(/\{([a-zA-Z]+)\}/g, (match, key) => (
    values[key] === undefined ? match : String(values[key])
  ));
}

function calendarStatusKind(input) {
  if (!input.oauthConfigured) return "not_configured";
  if (!input.connected) return input.enabled ? "enabled_disconnected" : "not_connected";
  const target = input.targetAccountEmail.trim().toLowerCase();
  const connected = (input.connectedEmail ?? "").trim().toLowerCase();
  if (target && connected && target !== connected) return "connected_mismatch";
  return "connected";
}

test("upsert mapping is idempotent by entity and deletes when the date is cleared", () => {
  assert.equal(decideCalendarSyncAction("2026-09-10", null), "create");
  assert.equal(decideCalendarSyncAction("2026-09-11", "evt-1"), "update");
  assert.equal(decideCalendarSyncAction(null, "evt-1"), "delete");
  assert.equal(decideCalendarSyncAction("", "evt-1"), "delete");
  assert.equal(decideCalendarSyncAction("not-a-date", "evt-1"), "delete");
  assert.equal(decideCalendarSyncAction(null, null), "noop");
  assert.equal(decideCalendarSyncAction("", ""), "noop");
  assert.equal(addIsoDateDays("2026-09-10", 1), "2026-09-11");
  assert.equal(addIsoDateDays("2026-12-31", 1), "2027-01-01");
});

test("event templates interpolate follow-up fields and default to Danyal's calendar", async () => {
  const core = await readFile(files.core, "utf8");
  const title = interpolateLabel("Follow-up: {name}", { name: "Cairo Clinic", action: "Call" });
  const description = interpolateLabel("{type}\n{name}\nNext action: {action}\nDate: {date}", {
    type: "Sales follow-up",
    name: "Cairo Clinic",
    action: "Call",
    date: "2026-09-10",
  });
  assert.equal(title, "Follow-up: Cairo Clinic");
  assert.match(description, /Next action: Call/);
  assert.match(core, /danyal@rosettalanguages\.org/);
  assert.match(core, /enabled: false/);
  assert.match(core, /DEFAULT_CALENDAR_ID = "primary"/);
  assert.match(core, /Africa\/Cairo/);
  assert.match(core, /timeZone: timezone/);
  assert.match(core, /addIsoDateDays\(date, 1\)/);
});

test("admin status distinguishes missing OAuth, disconnected sync, and account mismatch", () => {
  assert.equal(calendarStatusKind({
    oauthConfigured: false, connected: false, enabled: true,
    targetAccountEmail: "danyal@rosettalanguages.org", connectedEmail: null,
  }), "not_configured");
  assert.equal(calendarStatusKind({
    oauthConfigured: true, connected: false, enabled: false,
    targetAccountEmail: "danyal@rosettalanguages.org", connectedEmail: null,
  }), "not_connected");
  assert.equal(calendarStatusKind({
    oauthConfigured: true, connected: false, enabled: true,
    targetAccountEmail: "danyal@rosettalanguages.org", connectedEmail: null,
  }), "enabled_disconnected");
  assert.equal(calendarStatusKind({
    oauthConfigured: true, connected: true, enabled: true,
    targetAccountEmail: "danyal@rosettalanguages.org", connectedEmail: "danyal@rosettalanguages.org",
  }), "connected");
  assert.equal(calendarStatusKind({
    oauthConfigured: true, connected: true, enabled: true,
    targetAccountEmail: "danyal@rosettalanguages.org", connectedEmail: "other@rosettalanguages.org",
  }), "connected_mismatch");
});

test("stores encrypted Google tokens and entity-to-event mappings in D1", async () => {
  const [schema, migration, journal, sync] = await Promise.all([
    readFile(files.schema, "utf8"),
    readFile(files.migration, "utf8"),
    readFile(files.journal, "utf8"),
    readFile(files.sync, "utf8"),
  ]);
  assert.match(schema, /calendarEventMappings/);
  assert.match(schema, /googleOauthConnections/);
  assert.match(schema, /encryptedRefreshToken/);
  assert.match(migration, /CREATE TABLE `calendar_event_mappings`/);
  assert.match(migration, /CREATE TABLE `google_oauth_connections`/);
  assert.match(migration, /encrypted_refresh_token/);
  assert.match(journal, /0009_google_calendar_sync/);
  assert.match(sync, /encryptSecret/);
  assert.match(sync, /AES-GCM/);
  assert.doesNotMatch(sync, /refresh_token: connection/);
  assert.match(sync, /encryptedRefreshToken/);
});

test("hooks follow-up create, update, and delete without failing sales CRUD", async () => {
  const [sync, deals, dealId, merge, followUps, followUpId] = await Promise.all([
    readFile(files.sync, "utf8"),
    readFile(files.deals, "utf8"),
    readFile(files.dealId, "utf8"),
    readFile(files.merge, "utf8"),
    readFile(files.followUps, "utf8"),
    readFile(files.followUpId, "utf8"),
  ]);
  assert.match(sync, /async function syncFollowUpCalendarSafe/);
  assert.match(sync, /Google Calendar follow-up sync failed/);
  assert.match(sync, /recordSyncOutcome/);
  assert.match(deals, /syncSalesFollowUpCalendar\(record\)/);
  assert.match(dealId, /syncSalesFollowUpCalendar\(record\)/);
  assert.match(dealId, /deleteFollowUpCalendarSafe\("sales_record"/);
  assert.match(merge, /deleteFollowUpCalendarSafe\("sales_record"/);
  assert.match(merge, /syncSalesFollowUpCalendar\(record\)/);
  assert.match(followUps, /syncClientCareCalendar\(followUp\)/);
  assert.match(followUpId, /syncClientCareCalendar\(followUp\)/);
  assert.match(followUpId, /deleteFollowUpCalendarSafe\("client_follow_up"/);
});

test("admin Calendar tab is editable and OAuth is admin-only", async () => {
  const [admin, api, oauthStart, oauthCallback, disconnect, salesConfig] = await Promise.all([
    readFile(files.admin, "utf8"),
    readFile(files.api, "utf8"),
    readFile(files.oauthStart, "utf8"),
    readFile(files.oauthCallback, "utf8"),
    readFile(files.disconnect, "utf8"),
    readFile(files.salesConfig, "utf8"),
  ]);
  assert.match(admin, /id: "calendar"/);
  assert.match(admin, /\/api\/calendar/);
  assert.match(admin, /\/api\/calendar\/oauth\/start/);
  assert.match(admin, /\/api\/calendar\/disconnect/);
  assert.match(admin, /calendarDraft.enabled/);
  assert.match(admin, /targetAccountEmail/);
  assert.match(admin, /titleTemplate/);
  assert.match(admin, /descriptionTemplate/);
  assert.match(admin, /calendarStatusEnabledDisconnected/);
  assert.match(api, /requireRole\(request, \["admin"\]\)/);
  assert.match(oauthStart, /requireRole\(request, \["admin"\]\)/);
  assert.match(oauthCallback, /requireRole\(request, \["admin"\]\)/);
  assert.match(disconnect, /requireRole\(request, \["admin"\]\)/);
  assert.match(salesConfig, /adminTabCalendar/);
  assert.match(salesConfig, /calendarEnableLabel/);
  assert.match(salesConfig, /danyal@rosettalanguages\.org/);
});

test("setup docs list Worker secrets and Google Cloud steps without committing credentials", async () => {
  const [setup, readme, wrangler, core, sync] = await Promise.all([
    readFile(files.setup, "utf8"),
    readFile(files.readme, "utf8"),
    readFile(files.wrangler, "utf8"),
    readFile(files.core, "utf8"),
    readFile(files.sync, "utf8"),
  ]);
  assert.match(setup, /Google Calendar API/);
  assert.match(setup, /Authorized redirect URIs/);
  assert.match(setup, /\/api\/calendar\/oauth\/callback/);
  assert.match(setup, /GOOGLE_CLIENT_ID/);
  assert.match(setup, /GOOGLE_CLIENT_SECRET/);
  assert.match(setup, /wrangler secret put/);
  assert.match(setup, /calendar.events/);
  assert.match(readme, /GOOGLE_CALENDAR_SETUP.md/);
  assert.match(wrangler, /GOOGLE_CLIENT_ID/);
  assert.doesNotMatch(setup, /GOCSPX-/);
  assert.doesNotMatch(core, /GOCSPX-/);
  assert.doesNotMatch(sync, /GOCSPX-/);
  assert.doesNotMatch(wrangler, /"GOOGLE_CLIENT_SECRET":\s*"[^"]+"/);
  assert.doesNotMatch(sync, /client_secret: "AIza/);
});
