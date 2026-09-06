import { AccessError, createManagedUser, listManagedUsers, requireRole } from "../../lib/access";

export async function GET(request: Request) {
  try {
    await requireRole(request, ["admin"]);
    return Response.json({ users: await listManagedUsers() });
  } catch (error) {
    const status = error instanceof AccessError ? error.status : 500;
    return Response.json({ error: error instanceof Error ? error.message : "Unable to load accounts." }, { status });
  }
}

export async function POST(request: Request) {
  try {
    await requireRole(request, ["admin"]);
    const user = await createManagedUser(await request.json());
    return Response.json({ user }, { status: 201 });
  } catch (error) {
    const status = error instanceof AccessError ? error.status : 500;
    return Response.json({ error: error instanceof Error ? error.message : "Unable to create account." }, { status });
  }
}
