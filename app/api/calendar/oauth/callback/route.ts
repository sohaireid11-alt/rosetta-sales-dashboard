import { AccessError, requireRole } from "../../../../../lib/access";
import { calendarErrorMessage, finishGoogleCalendarOAuth } from "../../../../../lib/calendar-sync";

export async function GET(request: Request) {
  try {
    await requireRole(request, ["admin"]);
    return await finishGoogleCalendarOAuth(request);
  } catch (error) {
    const status = error instanceof AccessError ? error.status : 500;
    return Response.json({ error: calendarErrorMessage(error) }, { status });
  }
}
