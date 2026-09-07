import { getDatabase } from "../../db";
import type { AppUser } from "./access";
import { historyCutoffIso } from "./field-settings-core";

export type AuditActor = Pick<AppUser, "id" | "email" | "displayName">;

export type AuditEvent = {
  id: number;
  createdAt: string;
  actorUserId: number | null;
  actorEmail: string;
  actorDisplayName: string;
  actionType: string;
  entityType: string;
  entityId: string | null;
  summary: string;
};

const selectColumns = `
  id, created_at AS createdAt, actor_user_id AS actorUserId, actor_email AS actorEmail,
  actor_display_name AS actorDisplayName, action_type AS actionType, entity_type AS entityType,
  entity_id AS entityId, summary
`;

function isMissingTable(error: unknown) {
  return error instanceof Error && error.message.includes("no such table");
}

export function actorLabel(actor: AuditActor) {
  return actor.displayName.trim() || actor.email.trim() || "Someone";
}

export async function recordAuditEvent(input: {
  actor: AuditActor;
  actionType: string;
  entityType: string;
  entityId?: number | string | null;
  summary: string;
}) {
  try {
    const database = await getDatabase();
    await database.prepare(
      `INSERT INTO audit_events (
        created_at, actor_user_id, actor_email, actor_display_name, action_type, entity_type, entity_id, summary
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      new Date().toISOString(),
      input.actor.id || null,
      input.actor.email ?? "",
      actorLabel(input.actor),
      input.actionType,
      input.entityType,
      input.entityId == null ? null : String(input.entityId),
      input.summary
    ).run();
  } catch (error) {
    if (isMissingTable(error)) return;
    throw error;
  }
}

export async function listAuditEvents(options: { days: number; actorUserId?: number }) {
  const cutoff = historyCutoffIso(options.days);
  try {
    const database = await getDatabase();
    if (options.actorUserId != null) {
      const result = await database.prepare(
        `SELECT ${selectColumns} FROM audit_events WHERE created_at >= ? AND actor_user_id = ? ORDER BY created_at DESC, id DESC`
      ).bind(cutoff, options.actorUserId).all<AuditEvent>();
      return result.results;
    }
    const result = await database.prepare(
      `SELECT ${selectColumns} FROM audit_events WHERE created_at >= ? ORDER BY created_at DESC, id DESC`
    ).bind(cutoff).all<AuditEvent>();
    return result.results;
  } catch (error) {
    if (isMissingTable(error)) return [];
    throw error;
  }
}
