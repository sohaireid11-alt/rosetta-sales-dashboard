import { errorMessage, listRecords } from "../record-utils";
import { AccessError, requireRole } from "../../../lib/access";
import { FieldSettingsError, normalizeCustomDateRange } from "../../../lib/field-settings-core";
import { getFieldSettings } from "../../field-settings/field-settings-utils";
import { exportFilename, filterRecordsByLeadDateRange, filterRecordsByLeadDateWindow, recordsToCsv } from "../export-utils";

function readDays(value: string | null) {
  if (!value) return null;
  const days = Number(value);
  if (!Number.isInteger(days) || days < 1) {
    throw new FieldSettingsError("Choose a valid report range.");
  }
  return days;
}

export async function GET(request: Request) {
  try {
    await requireRole(request, ["admin"]);
    const url = new URL(request.url);
    const startParam = url.searchParams.get("start");
    const endParam = url.searchParams.get("end");
    const days = readDays(url.searchParams.get("days"));
    const settings = await getFieldSettings();
    const records = await listRecords();

    if (startParam != null || endParam != null) {
      if (!settings.customReportRangeEnabled) {
        throw new FieldSettingsError("Custom date range is turned off in Admin controls.");
      }
      const range = normalizeCustomDateRange(startParam, endParam);
      return new Response(recordsToCsv(filterRecordsByLeadDateRange(records, range.start, range.end)), {
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename=${exportFilename(undefined, range)}`,
          "Cache-Control": "no-store",
        },
      });
    }

    if (days != null && !settings.reportPresets.some((preset) => preset.days === days)) {
      throw new FieldSettingsError("Choose a report range from Admin controls.");
    }
    const filtered = days == null ? records : filterRecordsByLeadDateWindow(records, days);
    const filename = exportFilename(days ?? undefined);

    return new Response(recordsToCsv(filtered), {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename=${filename}`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    const status = error instanceof AccessError ? error.status : error instanceof FieldSettingsError ? error.status : 500;
    return Response.json({ error: errorMessage(error) }, { status });
  }
}
