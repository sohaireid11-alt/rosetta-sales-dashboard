import { AccessError, requireRole } from "../../lib/access";
import { FieldSettingsError } from "../../lib/field-settings-core";
import { fieldSettingsError, getFieldSettings, publicFieldSettings, replaceFieldList, replaceUiLabels } from "./field-settings-utils";

export async function GET(request: Request) {
  try {
    const user = await requireRole(request, ["admin", "contributor"]);
    const settings = await getFieldSettings(user.role === "admin");
    return Response.json(publicFieldSettings(settings, user.role === "admin"));
  } catch (error) {
    const status = error instanceof AccessError ? error.status : 500;
    return Response.json({ error: fieldSettingsError(error) }, { status });
  }
}

export async function PUT(request: Request) {
  try {
    await requireRole(request, ["admin"]);
    const payload = await request.json() as { listKey?: unknown; options?: unknown; labels?: unknown };
    if (payload.labels && typeof payload.labels === "object") {
      return Response.json(await replaceUiLabels(payload.labels));
    }
    return Response.json(await replaceFieldList(payload.listKey, payload.options));
  } catch (error) {
    const status = error instanceof AccessError ? error.status : error instanceof FieldSettingsError ? error.status : 500;
    return Response.json({ error: fieldSettingsError(error) }, { status });
  }
}
