import {
  ClientFollowUpValidationError,
  clientFollowUpError,
  readClientFollowUpInput,
  removeClientFollowUp,
  updateClientFollowUp,
} from "../client-follow-up-utils";
import { AccessError, requireRole } from "../../../lib/access";

function readId(value: string) {
  const id = Number(value);
  if (!Number.isInteger(id) || id < 1) throw new ClientFollowUpValidationError("Invalid client follow-up.");
  return id;
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    await requireRole(request, ["admin"]);
    const { id } = await context.params;
    const followUp = await updateClientFollowUp(readId(id), readClientFollowUpInput(await request.json()));
    if (!followUp) return Response.json({ error: "Client follow-up not found." }, { status: 404 });
    return Response.json({ followUp });
  } catch (error) {
    const status = error instanceof AccessError ? error.status : error instanceof ClientFollowUpValidationError ? 400 : 500;
    return Response.json({ error: clientFollowUpError(error) }, { status });
  }
}

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    await requireRole(request, ["admin"]);
    const { id } = await context.params;
    const deleted = await removeClientFollowUp(readId(id));
    if (!deleted) return Response.json({ error: "Client follow-up not found." }, { status: 404 });
    return new Response(null, { status: 204 });
  } catch (error) {
    const status = error instanceof AccessError ? error.status : 500;
    return Response.json({ error: clientFollowUpError(error) }, { status });
  }
}
