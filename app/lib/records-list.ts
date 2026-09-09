import { includesChoice, parseStoredValues } from "./field-values";

export const RECORDS_SORT_KEYS = ["name", "date", "status"] as const;
export type RecordsSortKey = (typeof RECORDS_SORT_KEYS)[number];

export const RECORDS_DATE_FILTERS = ["all", "last90", "quarter"] as const;
export type RecordsDateFilter = (typeof RECORDS_DATE_FILTERS)[number];

export type ListableSalesRecord = {
  id: number;
  leadName: string;
  contactName: string;
  company: string;
  contactPhone: string;
  stage: string;
  createdAt: string;
};

export function isRecordsSortKey(value: string): value is RecordsSortKey {
  return (RECORDS_SORT_KEYS as readonly string[]).includes(value);
}

export function isRecordsDateFilter(value: string): value is RecordsDateFilter {
  return (RECORDS_DATE_FILTERS as readonly string[]).includes(value);
}

export function recordMatchesNameFilter(record: Pick<ListableSalesRecord, "leadName" | "contactName" | "company" | "contactPhone">, query: string) {
  const searchQuery = query.trim().toLocaleLowerCase();
  if (!searchQuery) return true;
  const phoneQuery = searchQuery.replace(/\D/g, "");
  const nameMatches = [record.leadName, record.contactName, record.company].some((value) => value.toLocaleLowerCase().includes(searchQuery));
  const phoneMatches = phoneQuery.length > 0 && record.contactPhone.replace(/\D/g, "").includes(phoneQuery);
  return nameMatches || phoneMatches;
}

export function recordMatchesStatusFilter(stage: string, status: string) {
  if (!status) return true;
  return includesChoice(stage, status);
}

export function recordMatchesLeadDateFilter(createdAt: string, filter: RecordsDateFilter, now = new Date()) {
  if (filter === "all") return true;
  const cutoff = new Date(now);
  if (filter === "last90") cutoff.setDate(now.getDate() - 90);
  if (filter === "quarter") cutoff.setMonth(Math.floor(now.getMonth() / 3) * 3, 1);
  return new Date(`${createdAt.slice(0, 10)}T12:00:00`) >= cutoff;
}

function statusSortIndex(stage: string, statusOrder: readonly string[]) {
  const values = parseStoredValues(stage);
  const indexes = values.map((value) => statusOrder.indexOf(value)).filter((index) => index >= 0);
  return indexes.length ? Math.min(...indexes) : statusOrder.length;
}

export function sortSalesRecords<T extends Pick<ListableSalesRecord, "id" | "leadName" | "createdAt" | "stage">>(
  records: T[],
  sortKey: RecordsSortKey,
  statusOrder: readonly string[] = []
) {
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

export function filterAndSortSalesRecords<T extends ListableSalesRecord>(
  records: T[],
  options: {
    nameQuery: string;
    status: string;
    dateFilter: RecordsDateFilter;
    sortKey: RecordsSortKey;
    statusOrder: readonly string[];
    now?: Date;
  }
) {
  const filtered = records.filter((record) => (
    recordMatchesNameFilter(record, options.nameQuery)
    && recordMatchesStatusFilter(record.stage, options.status)
    && recordMatchesLeadDateFilter(record.createdAt, options.dateFilter, options.now)
  ));
  return sortSalesRecords(filtered, options.sortKey, options.statusOrder);
}
