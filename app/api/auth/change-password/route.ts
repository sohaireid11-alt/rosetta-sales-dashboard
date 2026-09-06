import { AccessError, changeOwnPassword, requireRole } from "../../../lib/access";

export async function POST(request: Request) {
  try {
    const user = await requireRole(request, ["admin", "contributor"]);
    const payload = await request.json() as { currentPassword?: unknown; newPassword?: unknown };
    await changeOwnPassword(user, payload.currentPassword, payload.newPassword);
    return Response.json({ ok: true });
  } catch (error) {
    const status = error instanceof AccessError ? error.status : 500;
    return Response.json({ error: error instanceof Error ? error.message : "Unable to change password." }, { status });
  }
}
