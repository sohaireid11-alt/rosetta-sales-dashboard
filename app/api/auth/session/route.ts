import { isExternalAccessConfigured, isExternalAccessEnabled, sessionUser } from "../../../lib/access";

export async function GET(request: Request) {
  const enabled = isExternalAccessEnabled();
  return Response.json({
    configured: isExternalAccessConfigured(),
    legacy: !enabled,
    user: enabled ? await sessionUser(request) : { id: 0, email: "", displayName: "Sohair", role: "admin" },
  });
}
