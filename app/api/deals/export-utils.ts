import { parseStoredValues } from "../../lib/field-values";
import { leadDateCutoff, reportExportFilename } from "../../lib/field-settings-core";
import type { SalesRecord } from "./record-utils";

export const EXPORT_COLUMNS = [
  "Lead name",
  "Company",
  "Organization type",
  "Source type",
  "Referred by",
  "Request received by",
  "Service",
  "Service delivery",
  "Interpretation mode",
  "Opportunity type",
  "Status",
  "Contact name",
  "Contact title",
  "Contact email",
  "Contact phone",
  "Meeting stage",
  "Next meeting date",
  "Date of next follow-up",
  "Action needed",
  "Deal value (USD)",
  "Lead date",
  "Close date",
] as const;

function exportChoice(value: string | null) {
  return parseStoredValues(value).join("; ");
}

export function csvCell(value: string | number | null) {
  const text = value === null ? "" : String(value);
  return `"${text.replaceAll('"', '""')}"`;
}

export function recordsToCsv(records: SalesRecord[]) {
  const rows = [
    [...EXPORT_COLUMNS],
    ...records.map((record) => [
      record.leadName,
      record.company,
      exportChoice(record.organizationType),
      exportChoice(record.sourceType),
      record.referredBy,
      record.requestReceivedBy,
      exportChoice(record.service),
      exportChoice(record.serviceDelivery),
      exportChoice(record.interpretationMode),
      exportChoice(record.opportunityType),
      exportChoice(record.stage),
      record.contactName,
      record.contactTitle,
      record.contactEmail,
      record.contactPhone,
      exportChoice(record.meetingStage),
      record.nextMeetingAt,
      record.nextFollowUpAt,
      exportChoice(record.nextAction),
      (record.estimatedRevenueCents / 100).toFixed(2),
      record.createdAt,
      record.closedAt,
    ]),
  ];
  return rows.map((row) => row.map(csvCell).join(",")).join("\r\n");
}

export function filterRecordsByLeadDateWindow(records: SalesRecord[], days: number, now = new Date()) {
  const cutoff = leadDateCutoff(days, now);
  return records.filter((record) => record.createdAt >= cutoff);
}

export function exportFilename(days?: number) {
  return days ? reportExportFilename(days) : "rosetta-sales-records.csv";
}
