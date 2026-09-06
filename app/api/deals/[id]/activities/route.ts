import { AccessError, requireRole } from "../../../../lib/access";
import { RecordValidationError, addActivity, errorMessage, listActivities } from "../../record-utils";

function readId(value: string) {
  const id = Number(value);
  if (!Number.isInteger(id) || id < 1) throw new RecordValidationError("Invalid sales record.");
  return id;
}

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    await requireRole(request, ["admin"]);
    const { id } = await context.params;
    return Response.json({ activities: await listActivities(readId(id)) });
  } catch (error) {
    const status = error instanceof AccessError ? error.status : error instanceof RecordValidationError ? 400 : 500;
    return Response.json({ error: errorMessage(error) }, { status });
  }
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    await requireRole(request, ["admin"]);
    const { id } = await context.params;
    const payload = await request.json() as { activityType?: unknown; content?: unknown };
    const activity = await addActivity(readId(id), payload.activityType, payload.content);
    return Response.json({ activity }, { status: 201 });
  } catch (error) {
    const status = error instanceof AccessError ? error.status : error instanceof RecordValidationError ? 400 : 500;
    return Response.json({ error: errorMessage(error) }, { status });
  }
}
