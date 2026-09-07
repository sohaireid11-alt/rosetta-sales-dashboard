import { RecordValidationError, createRecord, errorMessage, listRecords, readRecordInput } from "./record-utils";
import { AccessError, requireRole } from "../../lib/access";
import { actorLabel, recordAuditEvent } from "../../lib/audit";

export async function GET(request: Request) {
  try {
    await requireRole(request, ["admin"]);
    return Response.json({ records: await listRecords() });
  } catch (error) {
    const status = error instanceof AccessError ? error.status : 500;
    return Response.json({ error: errorMessage(error) }, { status });
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireRole(request, ["admin", "contributor"]);
    const payload = await request.json();
    const record = await createRecord(
      await readRecordInput(
        user.role === "contributor" && payload && typeof payload === "object"
          ? { ...(payload as Record<string, unknown>), owner: user.displayName }
          : payload
      )
    );
    if (record) {
      await recordAuditEvent({
        actor: user,
        actionType: "create",
        entityType: "sales_record",
        entityId: record.id,
        summary: `${actorLabel(user)} added sales record ${record.leadName}`,
      });
    }
    return Response.json({ record }, { status: 201 });
  } catch (error) {
    const status = error instanceof AccessError ? error.status : error instanceof RecordValidationError ? 400 : 500;
    return Response.json({ error: errorMessage(error) }, { status });
  }
}
