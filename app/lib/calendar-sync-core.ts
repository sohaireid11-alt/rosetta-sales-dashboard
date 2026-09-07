import { interpolateLabel } from "./field-settings-core";

export const CALENDAR_ENTITY_TYPES = ["sales_record", "client_follow_up"] as const;
export type CalendarEntityType = (typeof CALENDAR_ENTITY_TYPES)[number];

export const CALENDAR_SYNC_SETTINGS_KEY = "calendar_sync";
export const DEFAULT_CALENDAR_TARGET_EMAIL = "danyal@rosettalanguages.org";
export const DEFAULT_CALENDAR_ID = "primary";
export const DEFAULT_CALENDAR_TIMEZONE = "Africa/Cairo";
export const DEFAULT_CALENDAR_TITLE_TEMPLATE = "Follow-up: {name}";
export const DEFAULT_CALENDAR_DESCRIPTION_TEMPLATE = [
  "{type}",
  "{name}",
  "Next action: {action}",
  "Date: {date}",
  "{context}",
].join("\n");

export const GOOGLE_CALENDAR_SCOPES = [
  "https://www.googleapis.com/auth/calendar.events",
  "https://www.googleapis.com/auth/userinfo.email",
] as const;

export type CalendarSyncSettings = {
  enabled: boolean;
  targetAccountEmail: string;
  calendarId: string;
  timezone: string;
  titleTemplate: string;
  descriptionTemplate: string;
  lastSyncAt: string | null;
  lastSyncError: string | null;
};

export type CalendarSyncAction = "create" | "update" | "delete" | "noop";

export type FollowUpTemplateValues = {
  name: string;
  action: string;
  date: string;
  type: string;
  stage: string;
  service: string;
  company: string;
  context: string;
};

export type CalendarEventPayload = {
  summary: string;
  description: string;
  start: { date: string; timeZone: string };
  end: { date: string; timeZone: string };
};

export type CalendarStatusKind =
  | "not_configured"
  | "not_connected"
  | "enabled_disconnected"
  | "connected"
  | "connected_mismatch";

export class CalendarSettingsError extends Error {
  readonly status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

export function defaultCalendarSyncSettings(): CalendarSyncSettings {
  return {
    enabled: false,
    targetAccountEmail: DEFAULT_CALENDAR_TARGET_EMAIL,
    calendarId: DEFAULT_CALENDAR_ID,
    timezone: DEFAULT_CALENDAR_TIMEZONE,
    titleTemplate: DEFAULT_CALENDAR_TITLE_TEMPLATE,
    descriptionTemplate: DEFAULT_CALENDAR_DESCRIPTION_TEMPLATE,
    lastSyncAt: null,
    lastSyncError: null,
  };
}

export function isCalendarEntityType(value: unknown): value is CalendarEntityType {
  return typeof value === "string" && (CALENDAR_ENTITY_TYPES as readonly string[]).includes(value);
}

export function normalizeFollowUpDate(value: unknown) {
  const date = typeof value === "string" ? value.trim() : "";
  return /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : null;
}

export function addIsoDateDays(date: string, days: number) {
  const year = Number(date.slice(0, 4));
  const month = Number(date.slice(5, 7));
  const day = Number(date.slice(8, 10));
  const utc = new Date(Date.UTC(year, month - 1, day));
  utc.setUTCDate(utc.getUTCDate() + days);
  return utc.toISOString().slice(0, 10);
}

export function decideCalendarSyncAction(followUpDate: string | null | undefined, existingEventId: string | null | undefined): CalendarSyncAction {
  const date = normalizeFollowUpDate(followUpDate);
  const eventId = typeof existingEventId === "string" ? existingEventId.trim() : "";
  if (!date) return eventId ? "delete" : "noop";
  return eventId ? "update" : "create";
}

export function allDayEventRange(date: string, timezone: string) {
  return {
    start: { date, timeZone: timezone },
    end: { date: addIsoDateDays(date, 1), timeZone: timezone },
  };
}

export function interpolateCalendarTemplate(template: string, values: Record<string, string | number>) {
  return interpolateLabel(template, values).replaceAll(/\n{3,}/g, "\n\n").trim();
}

export function buildFollowUpCalendarEvent(
  templates: Pick<CalendarSyncSettings, "titleTemplate" | "descriptionTemplate" | "timezone">,
  values: FollowUpTemplateValues,
  followUpDate: string
): CalendarEventPayload {
  const range = allDayEventRange(followUpDate, templates.timezone);
  return {
    summary: interpolateCalendarTemplate(templates.titleTemplate, values) || `Follow-up: ${values.name}`.trim(),
    description: interpolateCalendarTemplate(templates.descriptionTemplate, values),
    start: range.start,
    end: range.end,
  };
}

export function followUpTemplateValues(input: {
  name: string;
  action?: string | null;
  date?: string | null;
  type: string;
  stage?: string | null;
  service?: string | null;
  company?: string | null;
  context?: string | null;
}): FollowUpTemplateValues {
  const action = (input.action ?? "").trim();
  const date = (input.date ?? "").trim();
  const stage = (input.stage ?? "").trim();
  const service = (input.service ?? "").trim();
  const company = (input.company ?? "").trim();
  const context = (input.context ?? [company, stage, service].filter(Boolean).join(" · ")).trim();
  return {
    name: input.name.trim(),
    action,
    date,
    type: input.type.trim(),
    stage,
    service,
    company,
    context,
  };
}

function readEmail(value: unknown, fallback: string, label: string) {
  const email = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (!email) return fallback;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new CalendarSettingsError(`${label} must be a valid email address.`);
  }
  if (email.length > 160) throw new CalendarSettingsError(`${label} must be 160 characters or fewer.`);
  return email;
}

function readText(value: unknown, fallback: string, label: string, maximum: number, required = true) {
  if (value === undefined) return fallback;
  const text = typeof value === "string" ? value.trim() : "";
  if (!text) {
    if (!required) return fallback;
    throw new CalendarSettingsError(`${label} cannot be empty.`);
  }
  if (text.length > maximum) throw new CalendarSettingsError(`${label} must be ${maximum} characters or fewer.`);
  return text;
}

function readFlag(value: unknown, fallback: boolean) {
  if (value === undefined || value === null) return fallback;
  if (typeof value === "boolean") return value;
  if (value === "true" || value === 1 || value === "1") return true;
  if (value === "false" || value === 0 || value === "0") return false;
  return fallback;
}

export function normalizeCalendarSyncSettings(value: unknown, current = defaultCalendarSyncSettings()): CalendarSyncSettings {
  const source = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  return {
    enabled: readFlag(source.enabled, current.enabled),
    targetAccountEmail: readEmail(source.targetAccountEmail, current.targetAccountEmail, "Target Google account"),
    calendarId: readText(source.calendarId, current.calendarId, "Calendar ID", 200),
    timezone: readText(source.timezone, current.timezone, "Timezone", 80),
    titleTemplate: readText(source.titleTemplate, current.titleTemplate, "Event title template", 200),
    descriptionTemplate: readText(source.descriptionTemplate, current.descriptionTemplate, "Event description template", 2_000),
    lastSyncAt: typeof source.lastSyncAt === "string" && source.lastSyncAt.trim() ? source.lastSyncAt.trim() : current.lastSyncAt,
    lastSyncError: typeof source.lastSyncError === "string" && source.lastSyncError.trim() ? source.lastSyncError.trim() : source.lastSyncError === null ? null : current.lastSyncError,
  };
}

export function parseStoredCalendarSyncSettings(raw: string | null | undefined): CalendarSyncSettings {
  if (!raw) return defaultCalendarSyncSettings();
  try {
    return normalizeCalendarSyncSettings(JSON.parse(raw) as unknown);
  } catch {
    return defaultCalendarSyncSettings();
  }
}

export function publicCalendarSettings(settings: CalendarSyncSettings) {
  return {
    enabled: settings.enabled,
    targetAccountEmail: settings.targetAccountEmail,
    calendarId: settings.calendarId,
    timezone: settings.timezone,
    titleTemplate: settings.titleTemplate,
    descriptionTemplate: settings.descriptionTemplate,
  };
}

export function calendarStatusKind(input: {
  oauthConfigured: boolean;
  connected: boolean;
  enabled: boolean;
  targetAccountEmail: string;
  connectedEmail: string | null;
}): CalendarStatusKind {
  if (!input.oauthConfigured) return "not_configured";
  if (!input.connected) return input.enabled ? "enabled_disconnected" : "not_connected";
  const target = input.targetAccountEmail.trim().toLowerCase();
  const connected = (input.connectedEmail ?? "").trim().toLowerCase();
  if (target && connected && target !== connected) return "connected_mismatch";
  return "connected";
}

export function emailsMatch(left: string | null | undefined, right: string | null | undefined) {
  return (left ?? "").trim().toLowerCase() === (right ?? "").trim().toLowerCase();
}
