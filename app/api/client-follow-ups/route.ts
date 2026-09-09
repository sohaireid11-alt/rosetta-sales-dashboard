import {
  ClientFollowUpValidationError,
  applyLinkedLeadStatusFromCare,
  clientFollowUpError,
  createClientFollowUp,
  findClientFollowUp,
  listClientFollowUps,
  readClientFollowUpInput,
} from "./client-follow-up-utils";
import { AccessError, requireRole } from "../../lib/access";
import { actorLabel, recordAuditEvent } from "../../lib/audit";
import { syncClientCareCalendar, syncSalesFollowUpCalendar } from "../../lib/calendar-sync";
import { ensureWonClientFollowUps } from "./won-client-care";

export async function GET(request: Request) {
  try {
    const user = await requireRole(request, ["admin", "contributor"]);
    try {
      await ensureWonClientFollowUps({ actor: user });
    } catch {
      // Backfill is best-effort. Existing care rows must still list if it fails.
    }
    return Response.json({ followUps: await listClientFollowUps() });
  } catch (error) {
    const status = error instanceof AccessError ? error.status : 500;
    return Response.json({ error: clientFollowUpError(error) }, { status });
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireRole(request, ["admin", "contributor"]);
    const input = await readClientFollowUpInput(await request.json());
    let followUp = await createClientFollowUp(input);
    if (followUp) {
      const record = await applyLinkedLeadStatusFromCare(followUp.salesRecordId, input.status, user.role);
      if (record) {
        await recordAuditEvent({
          actor: user,
          actionType: "update",
          entityType: "sales_record",
          entityId: record.id,
          summary: `${actorLabel(user)} updated lead ${record.leadName} status from Client Care`,
        });
        await syncSalesFollowUpCalendar(record);
        await ensureWonClientFollowUps({ actor: user, salesRecordId: record.id });
        followUp = (await findClientFollowUp(followUp.id)) ?? followUp;
      }
      await recordAuditEvent({
        actor: user,
        actionType: "create",
        entityType: "client_follow_up",
        entityId: followUp.id,
        summary: `${actorLabel(user)} added client-care record ${followUp.clientName}`,
      });
      await syncClientCareCalendar(followUp);
    }
    return Response.json({ followUp }, { status: 201 });
  } catch (error) {
    const status = error instanceof AccessError ? error.status : error instanceof ClientFollowUpValidationError ? 400 : 500;
    return Response.json({ error: clientFollowUpError(error) }, { status });
  }
}
