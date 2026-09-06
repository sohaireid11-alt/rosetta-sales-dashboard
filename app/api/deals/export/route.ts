import { errorMessage, listRecords } from "../record-utils";
import { AccessError, requireRole } from "../../../lib/access";

function csvCell(value: string | number | null) {
  const text = value === null ? "" : String(value);
  return `"${text.replaceAll('"', '""')}"`;
}

export async function GET(request: Request) {
  try {
    await requireRole(request, ["admin"]);
    const records = await listRecords();
    const rows = [
      [
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
      ],
      ...records.map((record) => [
        record.leadName,
        record.company,
        record.organizationType,
        record.sourceType,
        record.referredBy,
        record.requestReceivedBy,
        record.service,
        record.serviceDelivery,
        record.interpretationMode,
        record.opportunityType,
        record.stage,
        record.contactName,
        record.contactTitle,
        record.contactEmail,
        record.contactPhone,
        record.meetingStage,
        record.nextMeetingAt,
        record.nextFollowUpAt,
        record.nextAction,
        (record.estimatedRevenueCents / 100).toFixed(2),
        record.createdAt,
        record.closedAt,
      ]),
    ];
    const csv = rows.map((row) => row.map(csvCell).join(",")).join("\r\n");

    return new Response(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": "attachment; filename=rosetta-sales-records.csv",
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    const status = error instanceof AccessError ? error.status : 500;
    return Response.json({ error: errorMessage(error) }, { status });
  }
}
