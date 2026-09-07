import { RecordValidationError, errorMessage, findRecord, mergeRecords } from "../../record-utils";
import { AccessError, requireRole } from "../../../../lib/access";
import { actorLabel, recordAuditEvent } from "../../../../lib/audit";
import { deleteFollowUpCalendarSafe, syncSalesFollowUpCalendar } from "../../../../lib/calendar-sync";

function readId(value: string) {
  const id = Number(value);
  if (!Number.isInteger(id) || id < 1) throw new RecordValidationError("Invalid sales record.");
  return id;
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireRole(request, ["admin"]);
    const { id } = await context.params;
    const payload = await request.json() as { duplicateRecordId?: unknown };
    const duplicate = await findRecord(Number(payload.duplicateRecordId));
    const record = await mergeRecords(readId(id), payload.duplicateRecordId);
    if (!record) return Response.json({ error: "Sales record not found." }, { status: 404 });
    await recordAuditEvent({
      actor: user,
      actionType: "merge",
      entityType: "sales_record",
      entityId: record.id,
      summary: `${actorLabel(user)} merged duplicate ${duplicate?.leadName ?? "record"} into ${record.leadName}`,
    });
    if (duplicate) await deleteFollowUpCalendarSafe("sales_record", duplicate.id);
    await syncSalesFollowUpCalendar(record);
    return Response.json({ record });
  } catch (error) {
    const status = error instanceof AccessError ? error.status : error instanceof RecordValidationError ? 400 : 500;
    return Response.json({ error: errorMessage(error) }, { status });
  }
}
