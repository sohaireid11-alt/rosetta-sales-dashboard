import { AccessError, requireRole } from "../../../../lib/access";
import { actorLabel, recordAuditEvent } from "../../../../lib/audit";
import { RecordValidationError, addActivity, errorMessage, findRecord, listActivities } from "../../record-utils";

function readId(value: string) {
  const id = Number(value);
  if (!Number.isInteger(id) || id < 1) throw new RecordValidationError("Invalid sales record.");
  return id;
}

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    await requireRole(request, ["admin"]);
    const { id } = await context.params;
    return Response.json({ activities: await listActivities(readId(id)) });
  } catch (error) {
    const status = error instanceof AccessError ? error.status : error instanceof RecordValidationError ? 400 : 500;
    return Response.json({ error: errorMessage(error) }, { status });
  }
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireRole(request, ["admin"]);
    const { id } = await context.params;
    const salesRecordId = readId(id);
    const payload = await request.json() as { activityType?: unknown; content?: unknown };
    const activity = await addActivity(salesRecordId, payload.activityType, payload.content);
    const record = await findRecord(salesRecordId);
    await recordAuditEvent({
      actor: user,
      actionType: "create",
      entityType: "sales_activity",
      entityId: activity?.id,
      summary: `${actorLabel(user)} added ${activity?.activityType ?? "an activity"} on ${record?.leadName ?? "a lead"}`,
    });
    return Response.json({ activity }, { status: 201 });
  } catch (error) {
    const status = error instanceof AccessError ? error.status : error instanceof RecordValidationError ? 400 : 500;
    return Response.json({ error: errorMessage(error) }, { status });
  }
}
