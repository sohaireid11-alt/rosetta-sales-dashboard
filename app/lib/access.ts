import { env } from "cloudflare:workers";
import { getDatabase } from "../../db";

export type AppRole = "admin" | "contributor";
export type AppUser = { id: number; email: string; displayName: string; role: AppRole };
export type ManagedUser = AppUser & { isActive: boolean; createdAt: string; lastLoginAt: string; mustChangePassword: boolean };

type StoredUser = AppUser & { isActive: number; passwordHash: string; mustChangePassword: number; createdAt: string; lastLoginAt: string };
type SessionPayload = { userId: number; expiresAt: number };

const encoder = new TextEncoder();
const decoder = new TextDecoder();
const SESSION_COOKIE = "rosetta_session";
const PASSWORD_ITERATIONS = 100_000;

export class AccessError extends Error {
  constructor(message: string, public readonly status: number) { super(message); }
}

function runtimeValue(name: string) {
  const value = (env as unknown as Record<string, string | undefined>)[name]?.trim();
  return value || null;
}

function requiredRuntimeValue(name: string) {
  const value = runtimeValue(name);
  if (!value) throw new AccessError("Password access has not been configured yet.", 503);
  return value;
}

function base64Url(bytes: Uint8Array) {
  let binary = "";
  bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

function decodeBase64Url(value: string) {
  const base64 = value.replaceAll("-", "+").replaceAll("_", "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  return Uint8Array.from(atob(base64), (character) => character.charCodeAt(0));
}

function randomBytes(length: number) {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return bytes;
}

async function sign(value: string) {
  const key = await crypto.subtle.importKey("raw", encoder.encode(requiredRuntimeValue("APP_SESSION_SECRET")), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return base64Url(new Uint8Array(await crypto.subtle.sign("HMAC", key, encoder.encode(value))));
}

function sameText(left: string, right: string) {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  return difference === 0;
}

async function seal<T>(payload: T) {
  const body = base64Url(encoder.encode(JSON.stringify(payload)));
  return body + "." + (await sign(body));
}

async function unseal<T>(value: string | undefined) {
  if (!value) return null;
  const [body, signature, extra] = value.split(".");
  if (!body || !signature || extra || !sameText(signature, await sign(body))) return null;
  try { return JSON.parse(decoder.decode(decodeBase64Url(body))) as T; } catch { return null; }
}

function readCookies(request: Request) {
  const values: Record<string, string> = {};
  for (const entry of (request.headers.get("cookie") ?? "").split(";")) {
    const divider = entry.indexOf("=");
    if (divider > 0) values[entry.slice(0, divider).trim()] = entry.slice(divider + 1);
  }
  return values;
}

function setCookie(name: string, value: string, maxAge: number) {
  return name + "=" + value + "; Path=/; Max-Age=" + maxAge + "; HttpOnly; Secure; SameSite=Lax";
}

function clearCookie(name: string) {
  return name + "=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax";
}

function normalizeEmail(value: unknown) {
  const email = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new AccessError("Enter a valid email address.", 400);
  return email;
}

function text(value: unknown, label: string, maximum = 120) {
  const result = typeof value === "string" ? value.trim() : "";
  if (!result) throw new AccessError(`${label} is required.`, 400);
  if (result.length > maximum) throw new AccessError(`${label} must be ${maximum} characters or fewer.`, 400);
  return result;
}

function readRole(value: unknown): AppRole {
  if (value === "admin" || value === "contributor") return value;
  throw new AccessError("Choose a valid access role.", 400);
}

function readPassword(value: unknown) {
  const password = typeof value === "string" ? value : "";
  if (password.length < 12) throw new AccessError("Use a temporary password with at least 12 characters.", 400);
  if (password.length > 200) throw new AccessError("The password is too long.", 400);
  return password;
}

async function passwordHash(password: string, salt = randomBytes(16)) {
  const key = await crypto.subtle.importKey("raw", encoder.encode(password), "PBKDF2", false, ["deriveBits"]);
  const bytes = new Uint8Array(await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt, iterations: PASSWORD_ITERATIONS }, key, 256));
  return `${PASSWORD_ITERATIONS}.${base64Url(salt)}.${base64Url(bytes)}`;
}

async function passwordMatches(password: string, storedHash: string) {
  const [iterationsText, saltText, hashText, extra] = storedHash.split(".");
  const iterations = Number(iterationsText);
  if (extra || !saltText || !hashText || !Number.isInteger(iterations) || iterations !== PASSWORD_ITERATIONS) return false;
  const key = await crypto.subtle.importKey("raw", encoder.encode(password), "PBKDF2", false, ["deriveBits"]);
  const bytes = new Uint8Array(await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: decodeBase64Url(saltText), iterations }, key, 256));
  return sameText(base64Url(bytes), hashText);
}

export function isExternalAccessEnabled() {
  return runtimeValue("PASSWORD_ACCESS_ENABLED") === "true";
}

export function isExternalAccessConfigured() {
  return isExternalAccessEnabled() && ["APP_SESSION_SECRET", "ADMIN_EMAIL", "INITIAL_ADMIN_PASSWORD"].every((name) => runtimeValue(name));
}

async function ensureInitialAdmin() {
  if (!isExternalAccessConfigured()) return;
  const email = normalizeEmail(requiredRuntimeValue("ADMIN_EMAIL"));
  const database = await getDatabase();
  const existing = await database.prepare("SELECT password_hash AS passwordHash FROM app_users WHERE email = ?").bind(email).first<{ passwordHash: string }>();
  if (existing?.passwordHash) return;
  const now = new Date().toISOString();
  const hash = await passwordHash(readPassword(requiredRuntimeValue("INITIAL_ADMIN_PASSWORD")));
  await database.prepare(
    "INSERT INTO app_users (email, display_name, role, password_hash, must_change_password, is_active, created_at, last_login_at) VALUES (?, 'Sohair', 'admin', ?, 1, 1, ?, ?) ON CONFLICT(email) DO UPDATE SET display_name = 'Sohair', role = 'admin', password_hash = excluded.password_hash, must_change_password = 1, is_active = 1"
  ).bind(email, hash, now, now).run();
}

async function findStoredUserByEmail(email: string) {
  return (await getDatabase()).prepare(
    "SELECT id, email, display_name AS displayName, role, password_hash AS passwordHash, must_change_password AS mustChangePassword, is_active AS isActive, created_at AS createdAt, last_login_at AS lastLoginAt FROM app_users WHERE email = ?"
  ).bind(email).first<StoredUser>();
}

function publicUser(user: StoredUser): AppUser {
  return { id: user.id, email: user.email, displayName: user.displayName, role: user.role };
}

export async function sessionUser(request: Request): Promise<AppUser | null> {
  if (!isExternalAccessConfigured()) return null;
  await ensureInitialAdmin();
  const session = await unseal<SessionPayload>(readCookies(request)[SESSION_COOKIE]);
  if (!session || session.expiresAt < Date.now()) return null;
  const user = await (await getDatabase()).prepare(
    "SELECT id, email, display_name AS displayName, role, password_hash AS passwordHash, must_change_password AS mustChangePassword, is_active AS isActive, created_at AS createdAt, last_login_at AS lastLoginAt FROM app_users WHERE id = ?"
  ).bind(session.userId).first<StoredUser>();
  if (!user || !user.isActive || (user.role !== "admin" && user.role !== "contributor")) return null;
  return publicUser(user);
}

export async function requireRole(request: Request, roles: AppRole[]) {
  if (!isExternalAccessEnabled()) return { id: 0, email: "", displayName: "Sohair", role: "admin" as const };
  const user = await sessionUser(request);
  if (!user) throw new AccessError("Sign in is required.", 401);
  if (!roles.includes(user.role)) throw new AccessError("You do not have permission for this action.", 403);
  return user;
}

export async function signInWithPassword(emailValue: unknown, passwordValue: unknown) {
  if (!isExternalAccessConfigured()) throw new AccessError("Password access has not been configured yet.", 503);
  await ensureInitialAdmin();
  const email = normalizeEmail(emailValue);
  const password = typeof passwordValue === "string" ? passwordValue : "";
  const user = await findStoredUserByEmail(email);
  if (!user || !user.isActive || !user.passwordHash || !(await passwordMatches(password, user.passwordHash))) {
    throw new AccessError("Email or password is incorrect.", 401);
  }
  if (user.role !== "admin" && user.role !== "contributor") throw new AccessError("This account does not have a valid role.", 403);
  await (await getDatabase()).prepare("UPDATE app_users SET last_login_at = ? WHERE id = ?").bind(new Date().toISOString(), user.id).run();
  return publicUser(user);
}

export async function createPasswordSession(user: AppUser) {
  const session = await seal<SessionPayload>({ userId: user.id, expiresAt: Date.now() + 7 * 24 * 60 * 60 * 1000 });
  return setCookie(SESSION_COOKIE, session, 7 * 24 * 60 * 60);
}

export function signOut() {
  return new Response(null, { status: 302, headers: { Location: "/", "Set-Cookie": clearCookie(SESSION_COOKIE) } });
}

export async function listManagedUsers() {
  await ensureInitialAdmin();
  const result = await (await getDatabase()).prepare(
    "SELECT id, email, display_name AS displayName, role, is_active AS isActive, created_at AS createdAt, last_login_at AS lastLoginAt, must_change_password AS mustChangePassword FROM app_users ORDER BY role DESC, display_name COLLATE NOCASE"
  ).all<ManagedUser>();
  return result.results;
}

export async function createManagedUser(input: unknown) {
  if (!input || typeof input !== "object") throw new AccessError("An account is required.", 400);
  const data = input as Record<string, unknown>;
  const email = normalizeEmail(data.email);
  const displayName = text(data.displayName, "Name");
  const role = readRole(data.role);
  const hash = await passwordHash(readPassword(data.temporaryPassword));
  const now = new Date().toISOString();
  try {
    const result = await (await getDatabase()).prepare(
      "INSERT INTO app_users (email, display_name, role, password_hash, must_change_password, is_active, created_at, last_login_at) VALUES (?, ?, ?, ?, 1, 1, ?, ?)"
    ).bind(email, displayName, role, hash, now, now).run();
    const id = Number(result.meta.last_row_id);
    return (await getDatabase()).prepare(
      "SELECT id, email, display_name AS displayName, role, is_active AS isActive, created_at AS createdAt, last_login_at AS lastLoginAt, must_change_password AS mustChangePassword FROM app_users WHERE id = ?"
    ).bind(id).first<ManagedUser>();
  } catch (error) {
    if (error instanceof Error && error.message.includes("UNIQUE")) throw new AccessError("An account already exists for this email.", 409);
    throw error;
  }
}

export async function resetManagedUserPassword(id: number, passwordValue: unknown) {
  const hash = await passwordHash(readPassword(passwordValue));
  const result = await (await getDatabase()).prepare(
    "UPDATE app_users SET password_hash = ?, must_change_password = 1 WHERE id = ? AND is_active = 1"
  ).bind(hash, id).run();
  if (!result.meta.changes) throw new AccessError("Active account not found.", 404);
}

export async function updateManagedUserRole(id: number, roleValue: unknown, currentUserId: number) {
  if (id === currentUserId) throw new AccessError("Use another administrator account to change your own access.", 400);
  const role = readRole(roleValue);
  const database = await getDatabase();
  const target = await database.prepare("SELECT id, role, is_active AS isActive FROM app_users WHERE id = ?").bind(id).first<{ id: number; role: string; isActive: number }>();
  if (!target || !target.isActive) throw new AccessError("Active account not found.", 404);
  if (target.role === role) return;
  if (target.role === "admin" && role === "contributor") {
    const count = await database.prepare("SELECT COUNT(*) AS count FROM app_users WHERE role = 'admin' AND is_active = 1").first<{ count: number }>();
    if ((count?.count ?? 0) < 2) throw new AccessError("Keep at least one active administrator account.", 400);
  }
  await database.prepare("UPDATE app_users SET role = ? WHERE id = ?").bind(role, id).run();
}

export async function deactivateManagedUser(id: number, currentUserId: number) {
  if (id === currentUserId) throw new AccessError("Use a different administrator account to remove this account.", 400);
  const database = await getDatabase();
  const target = await database.prepare("SELECT id, role, is_active AS isActive FROM app_users WHERE id = ?").bind(id).first<{ id: number; role: string; isActive: number }>();
  if (!target || !target.isActive) throw new AccessError("Active account not found.", 404);
  if (target.role === "admin") {
    const count = await database.prepare("SELECT COUNT(*) AS count FROM app_users WHERE role = 'admin' AND is_active = 1").first<{ count: number }>();
    if ((count?.count ?? 0) < 2) throw new AccessError("Keep at least one active administrator account.", 400);
  }
  await database.prepare("UPDATE app_users SET is_active = 0 WHERE id = ?").bind(id).run();
}

export async function changeOwnPassword(user: AppUser, currentPasswordValue: unknown, newPasswordValue: unknown) {
  const stored = await findStoredUserByEmail(user.email);
  const currentPassword = typeof currentPasswordValue === "string" ? currentPasswordValue : "";
  if (!stored || !(await passwordMatches(currentPassword, stored.passwordHash))) throw new AccessError("Your current password is incorrect.", 400);
  const hash = await passwordHash(readPassword(newPasswordValue));
  await (await getDatabase()).prepare("UPDATE app_users SET password_hash = ?, must_change_password = 0 WHERE id = ?").bind(hash, user.id).run();
}
