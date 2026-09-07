import { RecordValidationError, errorMessage, findRecord, removeRecord, readRecordInput, updateRecord } from "../record-utils";
import { AccessError, requireRole } from "../../../lib/access";
import { actorLabel, recordAuditEvent } from "../../../lib/audit";
import { deleteFollowUpCalendarSafe, syncSalesFollowUpCalendar } from "../../../lib/calendar-sync";

function readId(value: string) {
  const id = Number(value);
  if (!Number.isInteger(id) || id < 1) throw new Error("Invalid sales record.");
  return id;
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireRole(request, ["admin"]);
    const { id: rawId } = await context.params;
    const record = await updateRecord(readId(rawId), await readRecordInput(await request.json()));
    if (!record) return Response.json({ error: "Sales record not found." }, { status: 404 });
    await recordAuditEvent({
      actor: user,
      actionType: "update",
      entityType: "sales_record",
      entityId: record.id,
      summary: `${actorLabel(user)} updated lead ${record.leadName}`,
    });
    await syncSalesFollowUpCalendar(record);
    return Response.json({ record });
  } catch (error) {
    const status = error instanceof AccessError ? error.status : error instanceof RecordValidationError ? 400 : 500;
    return Response.json({ error: errorMessage(error) }, { status });
  }
}

export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireRole(_request, ["admin"]);
    const { id: rawId } = await context.params;
    const id = readId(rawId);
    const existing = await findRecord(id);
    const deleted = await removeRecord(id);
    if (!deleted || !existing) return Response.json({ error: "Sales record not found." }, { status: 404 });
    await recordAuditEvent({
      actor: user,
      actionType: "delete",
      entityType: "sales_record",
      entityId: existing.id,
      summary: `${actorLabel(user)} deleted sales record ${existing.leadName}`,
    });
    await deleteFollowUpCalendarSafe("sales_record", existing.id);
    return new Response(null, { status: 204 });
  } catch (error) {
    const status = error instanceof AccessError ? error.status : 500;
    return Response.json({ error: errorMessage(error) }, { status });
  }
}
