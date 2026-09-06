import { AccessError, deactivateManagedUser, requireRole, resetManagedUserPassword, updateManagedUserRole } from "../../../lib/access";

function readId(value: string) {
  const id = Number(value);
  if (!Number.isInteger(id) || id < 1) throw new AccessError("Invalid account.", 400);
  return id;
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const currentUser = await requireRole(request, ["admin"]);
    const { id } = await context.params;
    const payload = await request.json() as { temporaryPassword?: unknown; role?: unknown };
    const userId = readId(id);
    if (payload.role !== undefined) await updateManagedUserRole(userId, payload.role, currentUser.id);
    else await resetManagedUserPassword(userId, payload.temporaryPassword);
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
    await deactivateManagedUser(readId(id), user.id);
    return new Response(null, { status: 204 });
  } catch (error) {
    const status = error instanceof AccessError ? error.status : 500;
    return Response.json({ error: error instanceof Error ? error.message : "Unable to remove account." }, { status });
  }
}
