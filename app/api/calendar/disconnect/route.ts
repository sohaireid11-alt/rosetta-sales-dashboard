import { AccessError, requireRole } from "../../../lib/access";
import { calendarErrorMessage, disconnectGoogleCalendar } from "../../../lib/calendar-sync";

export async function POST(request: Request) {
  try {
    await requireRole(request, ["admin"]);
    return Response.json(await disconnectGoogleCalendar());
  } catch (error) {
    const status = error instanceof AccessError ? error.status : 500;
    return Response.json({ error: calendarErrorMessage(error) }, { status });
  }
}
