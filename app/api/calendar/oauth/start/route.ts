import { AccessError, requireRole } from "../../../../lib/access";
import { calendarErrorMessage, startGoogleCalendarOAuth } from "../../../../lib/calendar-sync";

export async function GET(request: Request) {
  try {
    await requireRole(request, ["admin"]);
    return await startGoogleCalendarOAuth(request);
  } catch (error) {
    const status = error instanceof AccessError ? error.status : 500;
    return Response.json({ error: calendarErrorMessage(error) }, { status });
  }
}
