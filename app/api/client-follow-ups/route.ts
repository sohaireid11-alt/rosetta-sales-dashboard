import {
  ClientFollowUpValidationError,
  clientFollowUpError,
  createClientFollowUp,
  listClientFollowUps,
  readClientFollowUpInput,
} from "./client-follow-up-utils";
import { AccessError, requireRole } from "../../lib/access";
import { actorLabel, recordAuditEvent } from "../../lib/audit";

export async function GET(request: Request) {
  try {
    await requireRole(request, ["admin"]);
    return Response.json({ followUps: await listClientFollowUps() });
  } catch (error) {
    const status = error instanceof AccessError ? error.status : 500;
    return Response.json({ error: clientFollowUpError(error) }, { status });
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireRole(request, ["admin"]);
    const followUp = await createClientFollowUp(await readClientFollowUpInput(await request.json()));
    if (followUp) {
      await recordAuditEvent({
        actor: user,
        actionType: "create",
        entityType: "client_follow_up",
        entityId: followUp.id,
        summary: `${actorLabel(user)} added client-care record ${followUp.clientName}`,
      });
    }
    return Response.json({ followUp }, { status: 201 });
  } catch (error) {
    const status = error instanceof AccessError ? error.status : error instanceof ClientFollowUpValidationError ? 400 : 500;
    return Response.json({ error: clientFollowUpError(error) }, { status });
  }
}
