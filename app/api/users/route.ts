import { AccessError, createManagedUser, listManagedUsers, requireRole } from "../../lib/access";
import { actorLabel, recordAuditEvent } from "../../lib/audit";

export async function GET(request: Request) {
  try {
    await requireRole(request, ["admin"]);
    return Response.json({ users: await listManagedUsers() });
  } catch (error) {
    const status = error instanceof AccessError ? error.status : 500;
    return Response.json({ error: error instanceof Error ? error.message : "Unable to load accounts." }, { status });
  }
}

export async function POST(request: Request) {
  try {
    const actor = await requireRole(request, ["admin"]);
    const user = await createManagedUser(await request.json());
    if (user) {
      await recordAuditEvent({
        actor,
        actionType: "create",
        entityType: "app_user",
        entityId: user.id,
        summary: `${actorLabel(actor)} created team account for ${user.displayName}`,
      });
    }
    return Response.json({ user }, { status: 201 });
  } catch (error) {
    const status = error instanceof AccessError ? error.status : 500;
    return Response.json({ error: error instanceof Error ? error.message : "Unable to create account." }, { status });
  }
}
