import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const files = {
  schema: new URL("../db/schema.ts", import.meta.url),
  migration: new URL("../drizzle/0008_audit_events.sql", import.meta.url),
  salesConfig: new URL("../app/sales-config.ts", import.meta.url),
  core: new URL("../app/lib/field-settings-core.ts", import.meta.url),
  utils: new URL("../app/api/field-settings/field-settings-utils.ts", import.meta.url),
  api: new URL("../app/api/field-settings/route.ts", import.meta.url),
  admin: new URL("../app/field-settings/page.tsx", import.meta.url),
  menu: new URL("../app/settings-menu.tsx", import.meta.url),
  back: new URL("../app/back-control.tsx", import.meta.url),
  home: new URL("../app/page.tsx", import.meta.url),
  team: new URL("../app/team/page.tsx", import.meta.url),
  contributor: new URL("../app/contributor-form.tsx", import.meta.url),
  historyPage: new URL("../app/history/page.tsx", import.meta.url),
  historyApi: new URL("../app/api/history/route.ts", import.meta.url),
  reportsPage: new URL("../app/reports/page.tsx", import.meta.url),
  exportRoute: new URL("../app/api/deals/export/route.ts", import.meta.url),
  exportUtils: new URL("../app/api/deals/export-utils.ts", import.meta.url),
  audit: new URL("../app/lib/audit.ts", import.meta.url),
  deals: new URL("../app/api/deals/route.ts", import.meta.url),
  dealId: new URL("../app/api/deals/[id]/route.ts", import.meta.url),
  merge: new URL("../app/api/deals/[id]/merge/route.ts", import.meta.url),
  activities: new URL("../app/api/deals/[id]/activities/route.ts", import.meta.url),
  importRoute: new URL("../app/api/deals/import/route.ts", import.meta.url),
  followUps: new URL("../app/api/client-follow-ups/route.ts", import.meta.url),
  followUpId: new URL("../app/api/client-follow-ups/[id]/route.ts", import.meta.url),
  users: new URL("../app/api/users/route.ts", import.meta.url),
  userId: new URL("../app/api/users/[id]/route.ts", import.meta.url),
};

function leadDateCutoff(days, now = new Date()) {
  const cutoff = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  cutoff.setUTCDate(cutoff.getUTCDate() - (days - 1));
  return cutoff.toISOString().slice(0, 10);
}

function historyCutoffIso(days, now = new Date()) {
  return new Date(now.getTime() - days * 24 * 60 * 60 * 1000).toISOString();
}

function interpolateLabel(template, values) {
  return template.replaceAll(/\{([a-zA-Z]+)\}/g, (match, key) => (
    values[key] === undefined ? match : String(values[key])
  ));
}

test("stores a durable audit log and admin-editable history/report config", async () => {
  const [schema, migration, salesConfig, core, utils, api, admin] = await Promise.all([
    readFile(files.schema, "utf8"),
    readFile(files.migration, "utf8"),
    readFile(files.salesConfig, "utf8"),
    readFile(files.core, "utf8"),
    readFile(files.utils, "utf8"),
    readFile(files.api, "utf8"),
    readFile(files.admin, "utf8"),
  ]);

  assert.match(schema, /auditEvents/);
  assert.match(schema, /actor_display_name/);
  assert.match(migration, /CREATE TABLE `audit_events`/);
  assert.match(salesConfig, /DEFAULT_HISTORY_LOOKBACK_DAYS = 5/);
  assert.match(salesConfig, /last-7-days/);
  assert.match(salesConfig, /last-30-days/);
  assert.match(salesConfig, /last-90-days/);
  assert.match(salesConfig, /navSettings/);
  assert.match(salesConfig, /navHistory/);
  assert.match(salesConfig, /navReports/);
  assert.match(salesConfig, /navBack/);
  assert.match(salesConfig, /historyWindowHint/);
  assert.match(salesConfig, /reportsCustomHeading/);
  assert.match(salesConfig, /DEFAULT_CUSTOM_REPORT_RANGE_ENABLED = true/);
  assert.match(salesConfig, /DEFAULT_SHOW_BACK_CONTROL = true/);
  assert.match(core, /historyLookbackDays/);
  assert.match(core, /reportPresets/);
  assert.match(core, /customReportRangeEnabled/);
  assert.match(core, /showBackControl/);
  assert.match(core, /normalizeHistoryLookbackDays/);
  assert.match(core, /normalizeReportPresets/);
  assert.match(core, /normalizeWorkspaceFlags/);
  assert.match(core, /customRangeExportFilename/);
  assert.match(utils, /history_lookback_days/);
  assert.match(utils, /report_presets/);
  assert.match(utils, /workspace_flags/);
  assert.match(api, /replaceHistoryLookbackDays/);
  assert.match(api, /replaceReportPresets/);
  assert.match(api, /replaceWorkspaceFlags/);
  assert.match(admin, /History & reports/);
  assert.match(admin, /Lookback window/);
  assert.match(admin, /CSV download ranges/);
  assert.match(admin, /customReportRangeEnabled/);
  assert.match(admin, /showBackControl/);
  assert.match(admin, /Show custom From\/To date range on Reports/);
  assert.match(admin, /Show Back on History, Reports, Team access, and Admin controls/);
  assert.match(admin, /no coding, GitHub, or Cloudflare dashboard needed/);
});

test("replaces top-right chrome with a Settings menu", async () => {
  const [menu, home, team, contributor, admin, historyPage, reportsPage] = await Promise.all([
    readFile(files.menu, "utf8"),
    readFile(files.home, "utf8"),
    readFile(files.team, "utf8"),
    readFile(files.contributor, "utf8"),
    readFile(files.admin, "utf8"),
    readFile(files.historyPage, "utf8"),
    readFile(files.reportsPage, "utf8"),
  ]);

  assert.match(menu, /labels.navSettings/);
  assert.match(menu, /href="\/team"/);
  assert.match(menu, /href="\/history"/);
  assert.match(menu, /href="\/reports"/);
  assert.match(menu, /href="\/admin"/);
  assert.match(menu, /\/api\/auth\/logout/);
  assert.match(menu, /Escape/);
  assert.match(menu, /role === "admin"/);
  assert.match(home, /SettingsMenu/);
  assert.doesNotMatch(home, /href="\/team"/);
  assert.match(team, /SettingsMenu/);
  assert.match(contributor, /SettingsMenu/);
  assert.match(admin, /SettingsMenu/);
  assert.match(historyPage, /SettingsMenu/);
  assert.match(reportsPage, /SettingsMenu/);
  assert.match(team, /BackControl/);
  assert.match(admin, /BackControl/);
  assert.match(historyPage, /BackControl/);
  assert.match(reportsPage, /BackControl/);
  assert.doesNotMatch(home, /BackControl/);
  assert.doesNotMatch(contributor, /BackControl/);
});

test("history and reports read lookback days and presets from admin config", async () => {
  const [historyApi, historyPage, reportsPage, exportRoute, exportUtils, audit] = await Promise.all([
    readFile(files.historyApi, "utf8"),
    readFile(files.historyPage, "utf8"),
    readFile(files.reportsPage, "utf8"),
    readFile(files.exportRoute, "utf8"),
    readFile(files.exportUtils, "utf8"),
    readFile(files.audit, "utf8"),
  ]);

  assert.match(historyApi, /requireRole\(request, \["admin", "contributor"\]\)/);
  assert.match(historyApi, /settings.historyLookbackDays/);
  assert.match(historyApi, /user.role === "admin"/);
  assert.match(historyPage, /interpolateLabel\(labels.historyWindowHint/);
  assert.match(reportsPage, /settings.reportPresets/);
  assert.match(reportsPage, /reportExportFilename\(preset.days\)/);
  assert.match(reportsPage, /customRangeExportFilename\(fromDate, toDate\)/);
  assert.match(reportsPage, /type="date"/);
  assert.match(reportsPage, /labels.reportsCustomInvalid/);
  assert.match(reportsPage, /labels.reportsCustomDownload/);
  assert.match(exportRoute, /settings.reportPresets.some/);
  assert.match(exportRoute, /url.searchParams.get\("days"\)/);
  assert.match(exportRoute, /url.searchParams.get\("start"\)/);
  assert.match(exportRoute, /url.searchParams.get\("end"\)/);
  assert.match(exportRoute, /normalizeCustomDateRange/);
  assert.match(exportRoute, /customReportRangeEnabled/);
  assert.match(exportUtils, /Lead date/);
  assert.match(exportUtils, /reportExportFilename/);
  assert.match(exportUtils, /filterRecordsByLeadDateRange/);
  assert.match(audit, /INSERT INTO audit_events/);
  assert.doesNotMatch(historyApi, /5 \* 24 \* 60 \* 60/);
  assert.doesNotMatch(reportsPage, /Download last 7 days/);
});

test("adds an admin-editable Back control that falls back to home", async () => {
  const [back, salesConfig, home, team, historyPage, reportsPage, admin] = await Promise.all([
    readFile(files.back, "utf8"),
    readFile(files.salesConfig, "utf8"),
    readFile(files.home, "utf8"),
    readFile(files.team, "utf8"),
    readFile(files.historyPage, "utf8"),
    readFile(files.reportsPage, "utf8"),
    readFile(files.admin, "utf8"),
  ]);

  assert.match(back, /window.history.back/);
  assert.match(back, /window.location.assign\("\/"\)/);
  assert.match(back, /window.history.length > 1/);
  assert.match(back, /referrer.origin === window.location.origin/);
  assert.match(salesConfig, /navBack: "Back"/);
  assert.match(team, /labels.navBack/);
  assert.match(historyPage, /labels.navBack/);
  assert.match(reportsPage, /labels.navBack/);
  assert.match(admin, /settings.labels.navBack/);
  assert.doesNotMatch(home, /BackControl/);
  assert.doesNotMatch(back, /href="\/admin"/);
});

test("writes audit events when dashboard data changes", async () => {
  const [deals, dealId, merge, activities, importRoute, followUps, followUpId, users, userId] = await Promise.all([
    readFile(files.deals, "utf8"),
    readFile(files.dealId, "utf8"),
    readFile(files.merge, "utf8"),
    readFile(files.activities, "utf8"),
    readFile(files.importRoute, "utf8"),
    readFile(files.followUps, "utf8"),
    readFile(files.followUpId, "utf8"),
    readFile(files.users, "utf8"),
    readFile(files.userId, "utf8"),
  ]);

  assert.match(deals, /added sales record/);
  assert.match(dealId, /updated lead/);
  assert.match(dealId, /deleted sales record/);
  assert.match(merge, /merged duplicate/);
  assert.match(activities, /added \$\{activity/);
  assert.match(importRoute, /imported/);
  assert.match(followUps, /added client-care record/);
  assert.match(followUpId, /updated client-care record/);
  assert.match(followUpId, /removed client-care record/);
  assert.match(users, /created team account/);
  assert.match(userId, /changed \$\{name\}'s access/);
  assert.match(userId, /reset \$\{name\}'s password/);
  assert.match(userId, /removed \$\{name\}'s account/);
});

test("filters report windows by inclusive lead-date calendar days", () => {
  const now = new Date("2026-09-07T15:00:00.000Z");
  assert.equal(leadDateCutoff(7, now), "2026-09-01");
  assert.equal(leadDateCutoff(30, now), "2026-08-09");
  assert.equal(leadDateCutoff(90, now), "2026-06-10");
  const cutoff = historyCutoffIso(5, now);
  assert.equal(new Date(cutoff).toISOString(), "2026-09-02T15:00:00.000Z");
  assert.equal(interpolateLabel("Showing the last {days} days.", { days: 5 }), "Showing the last 5 days.");
});

function leadDateKey(value) {
  return value.slice(0, 10);
}

function filterRecordsByLeadDateRange(records, start, end) {
  return records.filter((record) => {
    const leadDate = leadDateKey(record.createdAt);
    return leadDate >= start && leadDate <= end;
  });
}

function customRangeExportFilename(start, end) {
  return `rosetta-sales-${start}-to-${end}.csv`;
}

function isCustomDateRangeValid(start, end) {
  return Boolean(start && end && /^\d{4}-\d{2}-\d{2}$/.test(start) && /^\d{4}-\d{2}-\d{2}$/.test(end) && start <= end);
}

test("filters custom report ranges inclusively and names the CSV from the dates", () => {
  const records = [
    { createdAt: "2025-12-31" },
    { createdAt: "2026-01-01" },
    { createdAt: "2026-01-15" },
    { createdAt: "2026-01-31" },
    { createdAt: "2026-02-01" },
  ];
  assert.deepEqual(
    filterRecordsByLeadDateRange(records, "2026-01-01", "2026-01-31").map((record) => record.createdAt),
    ["2026-01-01", "2026-01-15", "2026-01-31"]
  );
  assert.equal(customRangeExportFilename("2026-01-01", "2026-01-31"), "rosetta-sales-2026-01-01-to-2026-01-31.csv");
  assert.equal(isCustomDateRangeValid("2026-01-01", "2026-01-31"), true);
  assert.equal(isCustomDateRangeValid("", "2026-01-31"), false);
  assert.equal(isCustomDateRangeValid("2026-01-31", "2026-01-01"), false);
});
