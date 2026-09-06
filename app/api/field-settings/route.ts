import { AccessError, requireRole } from "../../lib/access";
import { FieldSettingsError } from "../../lib/field-settings-core";
import {
  fieldSettingsError,
  getFieldSettings,
  publicFieldSettings,
  replaceFieldDefinition,
  replaceFieldList,
  replaceSections,
  replaceUiLabels,
  replaceViewColumns,
} from "./field-settings-utils";

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

async function saveSettings(request: Request) {
  await requireRole(request, ["admin"]);
  const payload = await request.json() as {
    listKey?: unknown;
    options?: unknown;
    labels?: unknown;
    field?: unknown;
    entity?: unknown;
    fieldKey?: unknown;
    viewKey?: unknown;
    columns?: unknown;
    sections?: unknown;
  };
  if (payload.labels && typeof payload.labels === "object") {
    return Response.json(await replaceUiLabels(payload.labels));
  }
  if (payload.sections && typeof payload.sections === "object") {
    return Response.json(await replaceSections(payload.sections));
  }
  if (payload.viewKey && payload.columns) {
    return Response.json(await replaceViewColumns(payload.viewKey, payload.columns));
  }
  if (payload.field && typeof payload.field === "object") {
    const field = payload.field as { entity?: unknown; fieldKey?: unknown };
    return Response.json(await replaceFieldDefinition(payload.entity ?? field.entity, payload.fieldKey ?? field.fieldKey, payload.field));
  }
  return Response.json(await replaceFieldList(payload.listKey, payload.options));
}

export async function PUT(request: Request) {
  try {
    return await saveSettings(request);
  } catch (error) {
    const status = error instanceof AccessError ? error.status : error instanceof FieldSettingsError ? error.status : 500;
    return Response.json({ error: fieldSettingsError(error) }, { status });
  }
}

export async function PATCH(request: Request) {
  return PUT(request);
}
