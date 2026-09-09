import { getDatabase } from "../../../db";
import { AccessError, requireRole } from "../../lib/access";

export async function GET(request: Request) {
  try {
    await requireRole(request, ["admin", "contributor"]);
    const database = await getDatabase();
    const result = await database.prepare(
      "SELECT id, name, email, role FROM team_members WHERE is_active = 1 ORDER BY name COLLATE NOCASE"
    ).all<{ id: number; name: string; email: string; role: string }>();
    return Response.json({ members: result.results });
  } catch (error) {
    const status = error instanceof AccessError ? error.status : 500;
    return Response.json({ error: error instanceof Error ? error.message : "Unable to load team members." }, { status });
  }
}
