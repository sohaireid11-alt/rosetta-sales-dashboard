import { AccessError, requireRole } from "../../lib/access";
import { CalendarSettingsError } from "../../lib/calendar-sync-core";
import { calendarErrorMessage, getCalendarPublicStatus, replaceCalendarSyncSettings } from "../../lib/calendar-sync";

export async function GET(request: Request) {
  try {
    await requireRole(request, ["admin"]);
    return Response.json(await getCalendarPublicStatus());
  } catch (error) {
    const status = error instanceof AccessError ? error.status : 500;
    return Response.json({ error: calendarErrorMessage(error) }, { status });
  }
}

export async function PUT(request: Request) {
  try {
    await requireRole(request, ["admin"]);
    return Response.json(await replaceCalendarSyncSettings(await request.json()));
  } catch (error) {
    const status = error instanceof AccessError ? error.status : error instanceof CalendarSettingsError ? error.status : 500;
    return Response.json({ error: calendarErrorMessage(error) }, { status });
  }
}

export async function PATCH(request: Request) {
  return PUT(request);
}
