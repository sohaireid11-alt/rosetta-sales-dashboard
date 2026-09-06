import { AccessError, createPasswordSession, signInWithPassword } from "../../../lib/access";

export async function POST(request: Request) {
  try {
    const payload = await request.json() as { email?: unknown; password?: unknown };
    const user = await signInWithPassword(payload.email, payload.password);
    return Response.json({ user }, { headers: { "Set-Cookie": await createPasswordSession(user), "Cache-Control": "no-store" } });
  } catch (error) {
    const status = error instanceof AccessError ? error.status : 500;
    return Response.json({ error: error instanceof Error ? error.message : "Unable to sign in." }, { status });
  }
}
