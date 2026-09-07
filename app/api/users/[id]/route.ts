import { AccessError, deactivateManagedUser, requireRole, resetManagedUserPassword, updateManagedUserRole } from "../../../lib/access";
import { actorLabel, recordAuditEvent } from "../../../lib/audit";
import { getDatabase } from "../../../../db";

function readId(value: string) {
  const id = Number(value);
  if (!Number.isInteger(id) || id < 1) throw new AccessError("Invalid account.", 400);
  return id;
}

async function userDisplayName(id: number) {
  const row = await (await getDatabase()).prepare("SELECT display_name AS displayName FROM app_users WHERE id = ?").bind(id).first<{ displayName: string }>();
  return row?.displayName ?? "a teammate";
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const currentUser = await requireRole(request, ["admin"]);
    const { id } = await context.params;
    const payload = await request.json() as { temporaryPassword?: unknown; role?: unknown };
    const userId = readId(id);
    const name = await userDisplayName(userId);
    if (payload.role !== undefined) {
      await updateManagedUserRole(userId, payload.role, currentUser.id);
      await recordAuditEvent({
        actor: currentUser,
        actionType: "update",
        entityType: "app_user",
        entityId: userId,
        summary: `${actorLabel(currentUser)} changed ${name}'s access to ${payload.role}`,
      });
    } else {
      await resetManagedUserPassword(userId, payload.temporaryPassword);
      await recordAuditEvent({
        actor: currentUser,
        actionType: "update",
        entityType: "app_user",
        entityId: userId,
        summary: `${actorLabel(currentUser)} reset ${name}'s password`,
      });
    }
    return Response.json({ ok: true });
  } catch (error) {
    const status = error instanceof AccessError ? error.status : 500;
    return Response.json({ error: error instanceof Error ? error.message : "Unable to reset password." }, { status });
  }
}

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireRole(request, ["admin"]);
    const { id } = await context.params;
    const userId = readId(id);
    const name = await userDisplayName(userId);
    await deactivateManagedUser(userId, user.id);
    await recordAuditEvent({
      actor: user,
      actionType: "delete",
      entityType: "app_user",
      entityId: userId,
      summary: `${actorLabel(user)} removed ${name}'s account`,
    });
    return new Response(null, { status: 204 });
  } catch (error) {
    const status = error instanceof AccessError ? error.status : 500;
    return Response.json({ error: error instanceof Error ? error.message : "Unable to remove account." }, { status });
  }
}
