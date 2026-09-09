import {
  ClientFollowUpValidationError,
  clientFollowUpError,
  findClientFollowUp,
  readClientFollowUpInput,
  removeClientFollowUp,
  updateClientFollowUp,
} from "../client-follow-up-utils";
import { AccessError, requireRole } from "../../../lib/access";
import { actorLabel, recordAuditEvent } from "../../../lib/audit";
import { deleteFollowUpCalendarSafe, syncClientCareCalendar } from "../../../lib/calendar-sync";

function readId(value: string) {
  const id = Number(value);
  if (!Number.isInteger(id) || id < 1) throw new ClientFollowUpValidationError("Invalid client follow-up.");
  return id;
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireRole(request, ["admin", "contributor"]);
    const { id } = await context.params;
    const followUp = await updateClientFollowUp(readId(id), await readClientFollowUpInput(await request.json()));
    if (!followUp) return Response.json({ error: "Client follow-up not found." }, { status: 404 });
    await recordAuditEvent({
      actor: user,
      actionType: "update",
      entityType: "client_follow_up",
      entityId: followUp.id,
      summary: `${actorLabel(user)} updated client-care record ${followUp.clientName}`,
    });
    await syncClientCareCalendar(followUp);
    return Response.json({ followUp });
  } catch (error) {
    const status = error instanceof AccessError ? error.status : error instanceof ClientFollowUpValidationError ? 400 : 500;
    return Response.json({ error: clientFollowUpError(error) }, { status });
  }
}

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireRole(request, ["admin", "contributor"]);
    const { id } = await context.params;
    const followUpId = readId(id);
    const existing = await findClientFollowUp(followUpId);
    const deleted = await removeClientFollowUp(followUpId);
    if (!deleted || !existing) return Response.json({ error: "Client follow-up not found." }, { status: 404 });
    await recordAuditEvent({
      actor: user,
      actionType: "delete",
      entityType: "client_follow_up",
      entityId: existing.id,
      summary: `${actorLabel(user)} removed client-care record ${existing.clientName}`,
    });
    await deleteFollowUpCalendarSafe("client_follow_up", existing.id);
    return new Response(null, { status: 204 });
  } catch (error) {
    const status = error instanceof AccessError ? error.status : 500;
    return Response.json({ error: clientFollowUpError(error) }, { status });
  }
}
