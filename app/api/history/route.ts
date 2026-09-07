import { listAuditEvents } from "../../lib/audit";
import { AccessError, requireRole } from "../../lib/access";
import { getFieldSettings } from "../field-settings/field-settings-utils";

export async function GET(request: Request) {
  try {
    const user = await requireRole(request, ["admin", "contributor"]);
    const settings = await getFieldSettings();
    const events = await listAuditEvents({
      days: settings.historyLookbackDays,
      actorUserId: user.role === "admin" ? undefined : user.id,
    });
    return Response.json({
      events,
      historyLookbackDays: settings.historyLookbackDays,
    });
  } catch (error) {
    const status = error instanceof AccessError ? error.status : 500;
    return Response.json({ error: error instanceof Error ? error.message : "Unable to load change history." }, { status });
  }
}
