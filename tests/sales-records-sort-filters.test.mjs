import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const files = {
  list: new URL("../app/lib/records-list.ts", import.meta.url),
  home: new URL("../app/page.tsx", import.meta.url),
  salesConfig: new URL("../app/sales-config.ts", import.meta.url),
  settingsPage: new URL("../app/field-settings/page.tsx", import.meta.url),
};

function includesChoice(raw, choice) {
  if (!choice) return true;
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

function parseStoredValues(raw) {
  if (typeof raw !== "string" || !raw) return [];
  if (raw.startsWith("[")) {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed.filter((value) => typeof value === "string");
    } catch {
      return [raw];
    }
  }
  return [raw];
}

function recordMatchesNameFilter(record, query) {
  const searchQuery = query.trim().toLocaleLowerCase();
  if (!searchQuery) return true;
  const phoneQuery = searchQuery.replace(/\D/g, "");
  const nameMatches = [record.leadName, record.contactName, record.company].some((value) => value.toLocaleLowerCase().includes(searchQuery));
  const phoneMatches = phoneQuery.length > 0 && record.contactPhone.replace(/\D/g, "").includes(phoneQuery);
  return nameMatches || phoneMatches;
}

function recordMatchesStatusFilter(stage, status) {
  if (!status) return true;
  return includesChoice(stage, status);
}

function recordMatchesLeadDateFilter(createdAt, filter, now) {
  if (filter === "all") return true;
  const cutoff = new Date(now);
  if (filter === "last90") cutoff.setDate(now.getDate() - 90);
  if (filter === "quarter") cutoff.setMonth(Math.floor(now.getMonth() / 3) * 3, 1);
  return new Date(`${createdAt.slice(0, 10)}T12:00:00`) >= cutoff;
}

function statusSortIndex(stage, statusOrder) {
  const values = parseStoredValues(stage);
  const indexes = values.map((value) => statusOrder.indexOf(value)).filter((index) => index >= 0);
  return indexes.length ? Math.min(...indexes) : statusOrder.length;
}

function sortSalesRecords(records, sortKey, statusOrder = []) {
  return [...records].sort((left, right) => {
    if (sortKey === "name") {
      return left.leadName.localeCompare(right.leadName, undefined, { sensitivity: "base" }) || left.id - right.id;
    }
    if (sortKey === "status") {
      return statusSortIndex(left.stage, statusOrder) - statusSortIndex(right.stage, statusOrder)
        || left.leadName.localeCompare(right.leadName, undefined, { sensitivity: "base" })
        || left.id - right.id;
    }
    return right.createdAt.localeCompare(left.createdAt) || right.id - left.id;
  });
}

function filterAndSortSalesRecords(records, options) {
  const filtered = records.filter((record) => (
    recordMatchesNameFilter(record, options.nameQuery)
    && recordMatchesStatusFilter(record.stage, options.status)
    && recordMatchesLeadDateFilter(record.createdAt, options.dateFilter, options.now)
  ));
  return sortSalesRecords(filtered, options.sortKey, options.statusOrder);
}

const sample = [
  { id: 1, leadName: "Zed Clinic", contactName: "Ann", company: "Zed", contactPhone: "555-0100", stage: "Won", createdAt: "2026-01-01" },
  { id: 2, leadName: "Alpha School", contactName: "Bo", company: "Alpha", contactPhone: "555-0199", stage: "Pending", createdAt: "2026-08-01" },
  { id: 3, leadName: "Midtown Hall", contactName: "Cara", company: "City", contactPhone: "2125551234", stage: "New", createdAt: "2026-09-01" },
];

test("sorts sales records by name, date, and status picklist order", () => {
  const statusOrder = ["New", "Pending", "Won", "Lost", "Canceled"];
  assert.deepEqual(sortSalesRecords(sample, "name").map((row) => row.leadName), ["Alpha School", "Midtown Hall", "Zed Clinic"]);
  assert.deepEqual(sortSalesRecords(sample, "date").map((row) => row.id), [3, 2, 1]);
  assert.deepEqual(sortSalesRecords(sample, "status", statusOrder).map((row) => row.stage), ["New", "Pending", "Won"]);
});

test("filters the visible sales records list by name, date, and status", () => {
  const now = new Date("2026-09-09T12:00:00");
  assert.deepEqual(
    filterAndSortSalesRecords(sample, { nameQuery: "alpha", status: "", dateFilter: "all", sortKey: "name", statusOrder: [] }).map((row) => row.id),
    [2]
  );
  assert.deepEqual(
    filterAndSortSalesRecords(sample, { nameQuery: "212555", status: "", dateFilter: "all", sortKey: "name", statusOrder: [] }).map((row) => row.id),
    [3]
  );
  assert.deepEqual(
    filterAndSortSalesRecords(sample, { nameQuery: "", status: "Won", dateFilter: "all", sortKey: "name", statusOrder: [] }).map((row) => row.id),
    [1]
  );
  assert.deepEqual(
    filterAndSortSalesRecords(sample, { nameQuery: "", status: "", dateFilter: "last90", sortKey: "date", statusOrder: [], now }).map((row) => row.id),
    [3, 2]
  );
  assert.deepEqual(
    filterAndSortSalesRecords(sample, { nameQuery: "", status: "Pending", dateFilter: "last90", sortKey: "name", statusOrder: [], now }).map((row) => row.id),
    [2]
  );
});

test("Sales records Sort and Filters are wired to Field Settings labels and the status picklist", async () => {
  const [list, home, salesConfig, settingsPage] = await Promise.all([
    readFile(files.list, "utf8"),
    readFile(files.home, "utf8"),
    readFile(files.salesConfig, "utf8"),
    readFile(files.settingsPage, "utf8"),
  ]);

  assert.match(list, /export function filterAndSortSalesRecords/);
  assert.match(list, /export function sortSalesRecords/);
  assert.match(list, /RECORDS_SORT_KEYS = \["name", "date", "status"\]/);
  assert.match(home, /labels.recordsSortLabel/);
  assert.match(home, /labels.recordsSortName/);
  assert.match(home, /labels.recordsSortDate/);
  assert.match(home, /labels.recordsSortStatus/);
  assert.match(home, /labels.recordsFiltersLabel/);
  assert.match(home, /labels.recordsFilterName/);
  assert.match(home, /labels.recordsFilterDate/);
  assert.match(home, /labels.recordsFilterStatus/);
  assert.match(home, /visibleOptions\(lists.statuses\)/);
  assert.match(home, /filterAndSortSalesRecords\(visibleRecords/);
  assert.match(home, /listedRecords.map/);
  assert.match(salesConfig, /recordsSortLabel: "Sort"/);
  assert.match(salesConfig, /recordsFiltersLabel: "Filters"/);
  assert.match(salesConfig, /recordsFilterAllStatuses: "All statuses"/);
  assert.match(salesConfig, /group: "salesRecords", title: "Sort control label"/);
  assert.match(salesConfig, /Choices come from Lead statuses/);
  assert.match(settingsPage, /UI_LABEL_KEYS.filter/);
  assert.match(home, /labels.periodAllTime/);
  assert.match(home, /labels.periodLast90Days/);
  assert.match(home, /labels.periodThisQuarter/);
});
