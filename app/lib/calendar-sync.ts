import { getDatabase } from "../../db";
import { parseStoredLabels } from "./field-settings-core";
import { parseStoredValues } from "./field-values";
import { AccessError, clearCookie, runtimeValue, seal, setCookie, unseal } from "./access";
import { DEFAULT_UI_LABELS } from "../sales-config";
import {
  CALENDAR_SYNC_SETTINGS_KEY,
  CalendarSettingsError,
  GOOGLE_CALENDAR_SCOPES,
  buildFollowUpCalendarEvent,
  calendarStatusKind,
  decideCalendarSyncAction,
  defaultCalendarSyncSettings,
  followUpTemplateValues,
  normalizeCalendarSyncSettings,
  normalizeFollowUpDate,
  parseStoredCalendarSyncSettings,
  publicCalendarSettings,
  type CalendarEntityType,
  type CalendarEventPayload,
  type CalendarSyncSettings,
} from "./calendar-sync-core";

type GoogleOauthRow = {
  id: number;
  accountEmail: string;
  encryptedRefreshToken: string;
  encryptedAccessToken: string;
  accessTokenExpiresAt: string | null;
  scopes: string;
  connectedAt: string;
  updatedAt: string;
};

type CalendarMappingRow = {
  id: number;
  entityType: CalendarEntityType;
  entityId: number;
  googleEventId: string;
  calendarId: string;
  followUpDate: string | null;
  lastSyncedAt: string;
  lastError: string | null;
};

type GoogleTokenResponse = {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  scope?: string;
  token_type?: string;
  error?: string;
  error_description?: string;
};

type OauthState = { nonce: string; expiresAt: number };

const encoder = new TextEncoder();
const decoder = new TextDecoder();
const OAUTH_COOKIE = "rosetta_gcal_oauth";
const OAUTH_STATE_TTL_MS = 10 * 60 * 1000;
const ACCESS_TOKEN_SKEW_MS = 60 * 1000;

function isMissingTable(error: unknown) {
  return error instanceof Error && error.message.includes("no such table");
}

function googleClientId() {
  return runtimeValue("GOOGLE_CLIENT_ID");
}

function googleClientSecret() {
  return runtimeValue("GOOGLE_CLIENT_SECRET");
}

export function isGoogleOAuthConfigured() {
  return Boolean(googleClientId() && googleClientSecret());
}

export function calendarOAuthRedirectUri(request: Request) {
  return runtimeValue("GOOGLE_OAUTH_REDIRECT_URI") || `${new URL(request.url).origin}/api/calendar/oauth/callback`;
}

function tokenEncryptionSecret() {
  return runtimeValue("GOOGLE_TOKEN_ENCRYPTION_KEY") || runtimeValue("APP_SESSION_SECRET");
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

async function aesKey(secret: string) {
  const hash = await crypto.subtle.digest("SHA-256", encoder.encode(secret));
  return crypto.subtle.importKey("raw", hash, "AES-GCM", false, ["encrypt", "decrypt"]);
}

async function encryptSecret(plain: string) {
  const secret = tokenEncryptionSecret();
  if (!secret) throw new AccessError("Token encryption is not configured.", 503);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const cipher = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await aesKey(secret), encoder.encode(plain)));
  return `${base64Url(iv)}.${base64Url(cipher)}`;
}

async function decryptSecret(value: string) {
  const secret = tokenEncryptionSecret();
  if (!secret) throw new AccessError("Token encryption is not configured.", 503);
  const [ivText, cipherText, extra] = value.split(".");
  if (!ivText || !cipherText || extra) throw new Error("Stored Google Calendar token could not be read.");
  const bytes = new Uint8Array(await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: decodeBase64Url(ivText) },
    await aesKey(secret),
    decodeBase64Url(cipherText)
  ));
  return decoder.decode(bytes);
}

function displayChoices(value: string | null | undefined) {
  return parseStoredValues(value ?? "").join(", ");
}

function encodeCalendarId(calendarId: string) {
  return encodeURIComponent(calendarId.trim() || "primary");
}

async function writeSetting(key: string, value: unknown) {
  const database = await getDatabase();
  await database.prepare(
    "INSERT INTO app_settings (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at"
  ).bind(key, JSON.stringify(value), new Date().toISOString()).run();
}

export async function getCalendarSyncSettings(): Promise<CalendarSyncSettings> {
  try {
    const stored = await (await getDatabase()).prepare(
      "SELECT value FROM app_settings WHERE key = ?"
    ).bind(CALENDAR_SYNC_SETTINGS_KEY).first<{ value: string }>();
    return parseStoredCalendarSyncSettings(stored?.value);
  } catch (error) {
    if (isMissingTable(error)) return defaultCalendarSyncSettings();
    throw error;
  }
}

export async function replaceCalendarSyncSettings(value: unknown) {
  const current = await getCalendarSyncSettings();
  const next = normalizeCalendarSyncSettings(value, current);
  next.lastSyncAt = current.lastSyncAt;
  next.lastSyncError = current.lastSyncError;
  await writeSetting(CALENDAR_SYNC_SETTINGS_KEY, next);
  return getCalendarPublicStatus();
}

async function saveCalendarSyncSettings(settings: CalendarSyncSettings) {
  await writeSetting(CALENDAR_SYNC_SETTINGS_KEY, settings);
}

async function recordSyncOutcome(errorMessage: string | null) {
  try {
    const settings = await getCalendarSyncSettings();
    settings.lastSyncError = errorMessage;
    if (!errorMessage) settings.lastSyncAt = new Date().toISOString();
    await saveCalendarSyncSettings(settings);
  } catch (error) {
    if (isMissingTable(error)) return;
    console.error("Unable to store Google Calendar sync status.", error);
  }
}

async function loadConnection() {
  try {
    return await (await getDatabase()).prepare(
      `SELECT id, account_email AS accountEmail, encrypted_refresh_token AS encryptedRefreshToken,
              encrypted_access_token AS encryptedAccessToken, access_token_expires_at AS accessTokenExpiresAt,
              scopes, connected_at AS connectedAt, updated_at AS updatedAt
       FROM google_oauth_connections
       ORDER BY id DESC
       LIMIT 1`
    ).first<GoogleOauthRow>();
  } catch (error) {
    if (isMissingTable(error)) return null;
    throw error;
  }
}

async function loadMapping(entityType: CalendarEntityType, entityId: number) {
  try {
    return await (await getDatabase()).prepare(
      `SELECT id, entity_type AS entityType, entity_id AS entityId, google_event_id AS googleEventId,
              calendar_id AS calendarId, follow_up_date AS followUpDate, last_synced_at AS lastSyncedAt, last_error AS lastError
       FROM calendar_event_mappings
       WHERE entity_type = ? AND entity_id = ?`
    ).bind(entityType, entityId).first<CalendarMappingRow>();
  } catch (error) {
    if (isMissingTable(error)) return null;
    throw error;
  }
}

async function upsertMapping(row: Omit<CalendarMappingRow, "id">) {
  const database = await getDatabase();
  await database.prepare(
    `INSERT INTO calendar_event_mappings (
      entity_type, entity_id, google_event_id, calendar_id, follow_up_date, last_synced_at, last_error
    ) VALUES (?, ?, ?, ?, ?, ?, NULL)
    ON CONFLICT(entity_type, entity_id) DO UPDATE SET
      google_event_id = excluded.google_event_id,
      calendar_id = excluded.calendar_id,
      follow_up_date = excluded.follow_up_date,
      last_synced_at = excluded.last_synced_at,
      last_error = NULL`
  ).bind(row.entityType, row.entityId, row.googleEventId, row.calendarId, row.followUpDate, row.lastSyncedAt).run();
}

async function deleteMapping(entityType: CalendarEntityType, entityId: number) {
  await (await getDatabase()).prepare(
    "DELETE FROM calendar_event_mappings WHERE entity_type = ? AND entity_id = ?"
  ).bind(entityType, entityId).run();
}

export async function getCalendarPublicStatus() {
  const settings = await getCalendarSyncSettings();
  const connection = await loadConnection();
  const oauthConfigured = isGoogleOAuthConfigured();
  const connectedEmail = connection?.accountEmail || null;
  return {
    settings: publicCalendarSettings(settings),
    connection: {
      configured: oauthConfigured,
      connected: Boolean(connection?.encryptedRefreshToken),
      connectedEmail,
      connectedAt: connection?.connectedAt ?? null,
    },
    status: {
      kind: calendarStatusKind({
        oauthConfigured,
        connected: Boolean(connection?.encryptedRefreshToken),
        enabled: settings.enabled,
        targetAccountEmail: settings.targetAccountEmail,
        connectedEmail,
      }),
      lastSyncAt: settings.lastSyncAt,
      lastSyncError: settings.lastSyncError,
    },
  };
}

function formBody(data: Record<string, string>) {
  return new URLSearchParams(data).toString();
}

async function googleTokenRequest(body: Record<string, string>) {
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: formBody(body),
  });
  const payload = await response.json() as GoogleTokenResponse;
  if (!response.ok || !payload.access_token) {
    throw new Error(payload.error_description || payload.error || "Google did not return an access token.");
  }
  return payload;
}

async function googleUserEmail(accessToken: string) {
  const response = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const payload = await response.json() as { email?: string; error?: { message?: string } };
  if (!response.ok) throw new Error(payload.error?.message || "Unable to read the connected Google account.");
  return (payload.email ?? "").trim().toLowerCase();
}

async function storeConnection(input: {
  accountEmail: string;
  refreshToken: string;
  accessToken: string;
  expiresIn?: number;
  scopes?: string;
  connectedAt?: string;
}) {
  const now = new Date().toISOString();
  const expiresAt = input.expiresIn
    ? new Date(Date.now() + input.expiresIn * 1000).toISOString()
    : null;
  const database = await getDatabase();
  await database.batch([
    database.prepare("DELETE FROM google_oauth_connections"),
    database.prepare(
      `INSERT INTO google_oauth_connections (
        account_email, encrypted_refresh_token, encrypted_access_token, access_token_expires_at, scopes, connected_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      input.accountEmail,
      await encryptSecret(input.refreshToken),
      await encryptSecret(input.accessToken),
      expiresAt,
      input.scopes ?? GOOGLE_CALENDAR_SCOPES.join(" "),
      input.connectedAt ?? now,
      now
    ),
  ]);
}

async function accessTokenFromConnection(connection: GoogleOauthRow) {
  const refreshToken = await decryptSecret(connection.encryptedRefreshToken);
  const cachedExpiry = connection.accessTokenExpiresAt ? Date.parse(connection.accessTokenExpiresAt) : 0;
  if (connection.encryptedAccessToken && cachedExpiry - ACCESS_TOKEN_SKEW_MS > Date.now()) {
    return {
      accessToken: await decryptSecret(connection.encryptedAccessToken),
      refreshToken,
    };
  }
  const clientId = googleClientId();
  const clientSecret = googleClientSecret();
  if (!clientId || !clientSecret) throw new Error("Google Calendar OAuth is not configured on this Worker.");
  const tokens = await googleTokenRequest({
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: refreshToken,
    grant_type: "refresh_token",
  });
  await storeConnection({
    accountEmail: connection.accountEmail,
    refreshToken: tokens.refresh_token || refreshToken,
    accessToken: tokens.access_token!,
    expiresIn: tokens.expires_in,
    scopes: tokens.scope || connection.scopes,
    connectedAt: connection.connectedAt,
  });
  return { accessToken: tokens.access_token!, refreshToken: tokens.refresh_token || refreshToken };
}

async function calendarApi(
  method: string,
  path: string,
  accessToken: string,
  body?: CalendarEventPayload
) {
  const response = await fetch(`https://www.googleapis.com/calendar/v3/${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await response.text();
  let payload: { id?: string; error?: { message?: string } } = {};
  if (text) {
    try { payload = JSON.parse(text) as { id?: string; error?: { message?: string } }; } catch { payload = { error: { message: text.slice(0, 240) } }; }
  }
  return { ok: response.ok, status: response.status, payload };
}

async function createGoogleEvent(accessToken: string, calendarId: string, event: CalendarEventPayload) {
  const result = await calendarApi("POST", `calendars/${encodeCalendarId(calendarId)}/events`, accessToken, event);
  if (!result.ok || !result.payload.id) {
    throw new Error(result.payload.error?.message || "Google Calendar did not create the follow-up event.");
  }
  return result.payload.id;
}

async function updateGoogleEvent(accessToken: string, calendarId: string, eventId: string, event: CalendarEventPayload) {
  const result = await calendarApi("PUT", `calendars/${encodeCalendarId(calendarId)}/events/${encodeURIComponent(eventId)}`, accessToken, event);
  if (result.status === 404 || result.status === 410) return null;
  if (!result.ok) throw new Error(result.payload.error?.message || "Google Calendar did not update the follow-up event.");
  return result.payload.id || eventId;
}

async function deleteGoogleEvent(accessToken: string, calendarId: string, eventId: string) {
  const result = await calendarApi("DELETE", `calendars/${encodeCalendarId(calendarId)}/events/${encodeURIComponent(eventId)}`, accessToken);
  if (result.ok || result.status === 404 || result.status === 410) return;
  throw new Error(result.payload.error?.message || "Google Calendar did not delete the follow-up event.");
}

export function calendarErrorMessage(error: unknown) {
  if (error instanceof CalendarSettingsError || error instanceof AccessError) return error.message;
  if (error instanceof Error && error.message.includes("no such table")) {
    return "Calendar sync tables are still being prepared. Apply the D1 migration, then retry.";
  }
  return error instanceof Error ? error.message : "Unable to update Google Calendar settings.";
}

export async function startGoogleCalendarOAuth(request: Request) {
  if (!isGoogleOAuthConfigured()) {
    throw new AccessError("Google Calendar OAuth is not configured on this Worker.", 503);
  }
  const settings = await getCalendarSyncSettings();
  const state = await seal<OauthState>({ nonce: crypto.randomUUID(), expiresAt: Date.now() + OAUTH_STATE_TTL_MS });
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.searchParams.set("client_id", googleClientId()!);
  url.searchParams.set("redirect_uri", calendarOAuthRedirectUri(request));
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", GOOGLE_CALENDAR_SCOPES.join(" "));
  url.searchParams.set("access_type", "offline");
  url.searchParams.set("prompt", "consent");
  url.searchParams.set("include_granted_scopes", "false");
  url.searchParams.set("state", state);
  if (settings.targetAccountEmail) url.searchParams.set("login_hint", settings.targetAccountEmail);
  return new Response(null, {
    status: 302,
    headers: {
      Location: url.toString(),
      "Set-Cookie": setCookie(OAUTH_COOKIE, state, OAUTH_STATE_TTL_MS / 1000),
    },
  });
}

function oauthRedirect(origin: string, query: Record<string, string>) {
  const location = new URL("/admin", origin);
  for (const [key, value] of Object.entries(query)) location.searchParams.set(key, value);
  return location.toString();
}

export async function finishGoogleCalendarOAuth(request: Request) {
  const url = new URL(request.url);
  const origin = url.origin;
  const error = url.searchParams.get("error");
  if (error) {
    return new Response(null, { status: 302, headers: { Location: oauthRedirect(origin, { calendar: "error", reason: error }) } });
  }
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const cookies = Object.fromEntries(
    (request.headers.get("cookie") ?? "").split(";").map((entry) => {
      const divider = entry.indexOf("=");
      return divider > 0 ? [entry.slice(0, divider).trim(), entry.slice(divider + 1)] : ["", ""];
    }).filter((entry) => entry[0])
  );
  const expected = await unseal<OauthState>(cookies[OAUTH_COOKIE]);
  const received = await unseal<OauthState>(state ?? undefined);
  const headers = { "Set-Cookie": clearCookie(OAUTH_COOKIE) };
  if (!code || !expected || !received || expected.nonce !== received.nonce || received.expiresAt < Date.now()) {
    return new Response(null, { status: 302, headers: { ...headers, Location: oauthRedirect(origin, { calendar: "error", reason: "invalid_state" }) } });
  }
  try {
    const tokens = await googleTokenRequest({
      code,
      client_id: googleClientId()!,
      client_secret: googleClientSecret()!,
      redirect_uri: calendarOAuthRedirectUri(request),
      grant_type: "authorization_code",
    });
    if (!tokens.refresh_token) {
      throw new Error("Google did not return a refresh token. Disconnect other Calendar access and connect again with consent.");
    }
    const email = await googleUserEmail(tokens.access_token!);
    await storeConnection({
      accountEmail: email,
      refreshToken: tokens.refresh_token,
      accessToken: tokens.access_token!,
      expiresIn: tokens.expires_in,
      scopes: tokens.scope,
    });
    await recordSyncOutcome(null);
    return new Response(null, { status: 302, headers: { ...headers, Location: oauthRedirect(origin, { calendar: "connected" }) } });
  } catch (connectError) {
    return new Response(null, {
      status: 302,
      headers: {
        ...headers,
        Location: oauthRedirect(origin, { calendar: "error", reason: calendarErrorMessage(connectError).slice(0, 180) }),
      },
    });
  }
}

export async function disconnectGoogleCalendar() {
  const connection = await loadConnection();
  if (connection) {
    try {
      const refreshToken = await decryptSecret(connection.encryptedRefreshToken);
      await fetch("https://oauth2.googleapis.com/revoke", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: formBody({ token: refreshToken }),
      });
    } catch (error) {
      console.error("Google Calendar token revoke failed.", error);
    }
    await (await getDatabase()).prepare("DELETE FROM google_oauth_connections").run();
  }
  const settings = await getCalendarSyncSettings();
  settings.enabled = false;
  settings.lastSyncError = null;
  await saveCalendarSyncSettings(settings);
  return getCalendarPublicStatus();
}

async function syncFollowUpEvent(input: {
  entityType: CalendarEntityType;
  entityId: number;
  followUpDate: string | null;
  values: ReturnType<typeof followUpTemplateValues>;
}) {
  const settings = await getCalendarSyncSettings();
  if (!settings.enabled) return;
  const connection = await loadConnection();
  if (!connection) {
    await recordSyncOutcome("Sync is on, but Google Calendar is not connected.");
    return;
  }
  const mapping = await loadMapping(input.entityType, input.entityId);
  const action = decideCalendarSyncAction(input.followUpDate, mapping?.googleEventId);
  if (action === "noop") return;
  const { accessToken } = await accessTokenFromConnection(connection);
  const calendarId = settings.calendarId || "primary";
  const date = normalizeFollowUpDate(input.followUpDate);
  if (action === "delete" && mapping?.googleEventId) {
    await deleteGoogleEvent(accessToken, mapping.calendarId || calendarId, mapping.googleEventId);
    await deleteMapping(input.entityType, input.entityId);
    await recordSyncOutcome(null);
    return;
  }
  if (!date) return;
  const event = buildFollowUpCalendarEvent(settings, { ...input.values, date }, date);
  let eventId = mapping?.googleEventId ?? null;
  if (action === "update" && eventId) {
    eventId = await updateGoogleEvent(accessToken, mapping?.calendarId || calendarId, eventId, event);
  }
  if (!eventId) {
    eventId = await createGoogleEvent(accessToken, calendarId, event);
  }
  await upsertMapping({
    entityType: input.entityType,
    entityId: input.entityId,
    googleEventId: eventId,
    calendarId,
    followUpDate: date,
    lastSyncedAt: new Date().toISOString(),
    lastError: null,
  });
  await recordSyncOutcome(null);
}

export async function syncFollowUpCalendarSafe(input: {
  entityType: CalendarEntityType;
  entityId: number;
  followUpDate: string | null;
  values: ReturnType<typeof followUpTemplateValues>;
}) {
  try {
    await syncFollowUpEvent(input);
  } catch (error) {
    console.error("Google Calendar follow-up sync failed.", error);
    await recordSyncOutcome(calendarErrorMessage(error));
  }
}

export async function deleteFollowUpCalendarSafe(entityType: CalendarEntityType, entityId: number) {
  await syncFollowUpCalendarSafe({
    entityType,
    entityId,
    followUpDate: null,
    values: followUpTemplateValues({ name: "", type: "", date: null }),
  });
}

async function typeLabels() {
  try {
    const stored = await (await getDatabase()).prepare(
      "SELECT value FROM app_settings WHERE key = ?"
    ).bind("ui_labels").first<{ value: string }>();
    const labels = parseStoredLabels(stored?.value);
    return {
      sales: labels.calendarTypeSales || DEFAULT_UI_LABELS.calendarTypeSales,
      care: labels.calendarTypeCare || DEFAULT_UI_LABELS.calendarTypeCare,
    };
  } catch {
    return { sales: DEFAULT_UI_LABELS.calendarTypeSales, care: DEFAULT_UI_LABELS.calendarTypeCare };
  }
}

export async function syncSalesFollowUpCalendar(record: {
  id: number;
  leadName: string;
  company: string;
  service: string;
  stage: string;
  nextFollowUpAt: string | null;
  nextAction: string;
} | null | undefined) {
  if (!record) return;
  const type = (await typeLabels()).sales;
  await syncFollowUpCalendarSafe({
    entityType: "sales_record",
    entityId: record.id,
    followUpDate: record.nextFollowUpAt,
    values: followUpTemplateValues({
      name: record.leadName,
      action: displayChoices(record.nextAction),
      date: record.nextFollowUpAt,
      type,
      stage: record.stage,
      service: displayChoices(record.service),
      company: record.company,
    }),
  });
}

export async function syncClientCareCalendar(followUp: {
  id: number;
  clientName: string;
  relationshipType: string;
  satisfactionStatus: string;
  nextFollowUpAt: string | null;
  nextAction: string;
  expansionOpportunity?: string | null;
  linkedLeadName?: string | null;
} | null | undefined) {
  if (!followUp) return;
  const type = (await typeLabels()).care;
  const context = [
    followUp.linkedLeadName ? `Linked lead: ${followUp.linkedLeadName}` : "",
    displayChoices(followUp.relationshipType),
    displayChoices(followUp.satisfactionStatus),
    followUp.expansionOpportunity?.trim() ?? "",
  ].filter(Boolean).join(" · ");
  await syncFollowUpCalendarSafe({
    entityType: "client_follow_up",
    entityId: followUp.id,
    followUpDate: followUp.nextFollowUpAt,
    values: followUpTemplateValues({
      name: followUp.clientName,
      action: displayChoices(followUp.nextAction),
      date: followUp.nextFollowUpAt,
      type,
      stage: displayChoices(followUp.satisfactionStatus),
      service: displayChoices(followUp.relationshipType),
      company: followUp.linkedLeadName ?? "",
      context,
    }),
  });
}

export { followUpTemplateValues, displayChoices };
