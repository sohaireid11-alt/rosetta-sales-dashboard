import { RecordValidationError, errorMessage, removeRecord, readRecordInput, updateRecord } from "../record-utils";
import { AccessError, requireRole } from "../../../lib/access";

function readId(value: string) {
  const id = Number(value);
  if (!Number.isInteger(id) || id < 1) throw new Error("Invalid sales record.");
  return id;
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    await requireRole(request, ["admin"]);
    const { id: rawId } = await context.params;
    const record = await updateRecord(readId(rawId), readRecordInput(await request.json()));
    if (!record) return Response.json({ error: "Sales record not found." }, { status: 404 });
    return Response.json({ record });
  } catch (error) {
    const status = error instanceof AccessError ? error.status : error instanceof RecordValidationError ? 400 : 500;
    return Response.json({ error: errorMessage(error) }, { status });
  }
}

export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    await requireRole(_request, ["admin"]);
    const { id: rawId } = await context.params;
    const deleted = await removeRecord(readId(rawId));
    if (!deleted) return Response.json({ error: "Sales record not found." }, { status: 404 });
    return new Response(null, { status: 204 });
  } catch (error) {
    const status = error instanceof AccessError ? error.status : 500;
    return Response.json({ error: errorMessage(error) }, { status });
  }
}
