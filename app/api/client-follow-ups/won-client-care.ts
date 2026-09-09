import { getDatabase } from "../../../db";
import { actorLabel, recordAuditEvent, type AuditActor } from "../../lib/audit";
import { deleteFollowUpCalendarSafe } from "../../lib/calendar-sync";
import { includesChoice } from "../../lib/field-values";
import { RELATIONSHIP_TYPES, SATISFACTION_STATUSES, WON_STAGE } from "../../sales-config";
import { getFieldSettings } from "../field-settings/field-settings-utils";
import type { ClientFollowUpInput } from "./client-follow-up-utils";

export const OPPORTUNITY_TO_RELATIONSHIP: Record<string, string> = {
  "One-time project": "One-time client",
  "Recurring client": "Recurring client",
  "Ongoing vendor relationship": "Ongoing vendor relationship",
};

type WonLeadRow = {
  id: number;
  leadName: string;
  opportunityType: string;
  closedAt: string | null;
  createdAt: string;
  stage: string;
};

type LinkedCareRow = {
  id: number;
  clientName: string;
  salesRecordId: number;
  stage: string;
};

export function isWonStage(stage: unknown) {
  return includesChoice(stage, WON_STAGE);
}

/** Linked Client Care rows whose sales lead is no longer Won. Unlinked rows are never included. */
export function linkedCareRowsLeavingWon<T extends { salesRecordId: number | null; stage: unknown }>(rows: T[]) {
  return rows.filter((row) => row.salesRecordId != null && !isWonStage(row.stage));
}

export function careDateFromRecord(value: string | null | undefined) {
  const text = typeof value === "string" ? value.trim().slice(0, 10) : "";
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : null;
}

export function relationshipTypeForWonLead(opportunityType: string, relationshipTypes: readonly string[]) {
  const preferred = OPPORTUNITY_TO_RELATIONSHIP[opportunityType] ?? "Recurring client";
  if (relationshipTypes.includes(preferred)) return preferred;
  return relationshipTypes[0] ?? RELATIONSHIP_TYPES[0];
}

export function defaultSatisfactionStatus(statuses: readonly string[]) {
  if (statuses.includes("Healthy")) return "Healthy";
  return statuses[0] ?? SATISFACTION_STATUSES[0];
}

export function defaultCareNextAction(actions: readonly string[]) {
  return actions.includes("Client check-in") ? "Client check-in" : "";
}

export function careInputFromWonLead(
  record: WonLeadRow,
  lists: { relationshipTypes: readonly string[]; satisfactionStatuses: readonly string[]; followUpActions: readonly string[] }
): ClientFollowUpInput {
  return {
    salesRecordId: record.id,
    status: null,
    clientName: record.leadName,
    relationshipType: relationshipTypeForWonLead(record.opportunityType, lists.relationshipTypes),
    lastEngagementAt: careDateFromRecord(record.closedAt) ?? careDateFromRecord(record.createdAt),
    lastCheckInAt: null,
    satisfactionStatus: defaultSatisfactionStatus(lists.satisfactionStatuses),
    nextFollowUpAt: null,
    nextAction: defaultCareNextAction(lists.followUpActions),
    expansionOpportunity: "",
  };
}

function optionValues(options: { value: string; isActive: boolean }[], fallback: readonly string[]) {
  const active = options.filter((option) => option.isActive).map((option) => option.value);
  if (active.length) return active;
  const all = options.map((option) => option.value);
  return all.length ? all : [...fallback];
}

export const staleLinkedCareSelect = `SELECT client_follow_ups.id, client_follow_ups.client_name AS clientName,
         client_follow_ups.sales_record_id AS salesRecordId, sales_records.stage AS stage
         FROM client_follow_ups
         INNER JOIN sales_records ON sales_records.id = client_follow_ups.sales_record_id`;

export const deleteClientFollowUpByIdSql = "DELETE FROM client_follow_ups WHERE id = ?";

/**
 * Won → Client Care sync.
 * Toggle on: auto-add missing Won rows and delete linked care rows whose lead left Won.
 * Toggle off: neither auto-add nor auto-remove. Existing care rows stay, including after a lead leaves Won.
 */
export async function ensureWonClientFollowUps(options: {
  actor?: AuditActor;
  salesRecordId?: number;
} = {}) {
  try {
    const settings = await getFieldSettings(true);
    if (!settings.includeWonLeadsInClientCare) return { created: 0, removed: 0 };

    const lists = {
      relationshipTypes: optionValues(settings.lists.relationshipTypes, RELATIONSHIP_TYPES),
      satisfactionStatuses: optionValues(settings.lists.satisfactionStatuses, SATISFACTION_STATUSES),
      followUpActions: optionValues(settings.lists.followUpActions, ["Client check-in"]),
    };

    const database = await getDatabase();
    const sql = options.salesRecordId
      ? `SELECT id, lead_name AS leadName, opportunity_type AS opportunityType, closed_at AS closedAt, created_at AS createdAt, stage
         FROM sales_records
         WHERE id = ?
           AND NOT EXISTS (SELECT 1 FROM client_follow_ups WHERE client_follow_ups.sales_record_id = sales_records.id)`
      : `SELECT id, lead_name AS leadName, opportunity_type AS opportunityType, closed_at AS closedAt, created_at AS createdAt, stage
         FROM sales_records
         WHERE NOT EXISTS (SELECT 1 FROM client_follow_ups WHERE client_follow_ups.sales_record_id = sales_records.id)`;
    const query = options.salesRecordId
      ? database.prepare(sql).bind(options.salesRecordId)
      : database.prepare(sql);
    const missing = ((await query.all<WonLeadRow>()).results ?? []).filter((record) => isWonStage(record.stage));

    const now = new Date().toISOString();
    const statements = missing.map((record) => {
      const input = careInputFromWonLead(record, lists);
      return database.prepare(
        `INSERT OR IGNORE INTO client_follow_ups (
          sales_record_id, client_name, relationship_type, last_engagement_at, last_check_in_at,
          satisfaction_status, next_follow_up_at, next_action, expansion_opportunity, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).bind(
        input.salesRecordId, input.clientName, input.relationshipType, input.lastEngagementAt, input.lastCheckInAt,
        input.satisfactionStatus, input.nextFollowUpAt, input.nextAction, input.expansionOpportunity, now, now
      );
    });

    let created = 0;
    const batchSize = 50;
    for (let index = 0; index < statements.length; index += batchSize) {
      const batch = await database.batch(statements.slice(index, index + batchSize));
      created += batch.reduce((total, result) => total + (result.meta.changes ?? 0), 0);
    }
    if (created && options.actor) {
      const names = missing.slice(0, 3).map((record) => record.leadName).join(", ");
      const more = missing.length > 3 ? ` and ${missing.length - 3} more` : "";
      await recordAuditEvent({
        actor: options.actor,
        actionType: "create",
        entityType: "client_follow_up",
        entityId: options.salesRecordId ?? null,
        summary: created === 1
          ? `${actorLabel(options.actor)} added client-care record ${missing[0].leadName} for a Won lead`
          : `${actorLabel(options.actor)} added ${created} client-care records for Won leads (${names}${more})`,
      });
    }

    const staleQuery = options.salesRecordId
      ? database.prepare(`${staleLinkedCareSelect} WHERE client_follow_ups.sales_record_id = ?`).bind(options.salesRecordId)
      : database.prepare(staleLinkedCareSelect);
    const stale = linkedCareRowsLeavingWon((await staleQuery.all<LinkedCareRow>()).results ?? []);
    let removed = 0;
    if (stale.length) {
      const deletes = stale.map((row) => database.prepare(deleteClientFollowUpByIdSql).bind(row.id));
      for (let index = 0; index < deletes.length; index += batchSize) {
        const batch = await database.batch(deletes.slice(index, index + batchSize));
        removed += batch.reduce((total, result) => total + (result.meta.changes ?? 0), 0);
      }
      for (const row of stale) {
        await deleteFollowUpCalendarSafe("client_follow_up", row.id);
      }
      if (removed && options.actor) {
        const names = stale.slice(0, 3).map((row) => row.clientName).join(", ");
        const more = stale.length > 3 ? ` and ${stale.length - 3} more` : "";
        await recordAuditEvent({
          actor: options.actor,
          actionType: "delete",
          entityType: "client_follow_up",
          entityId: options.salesRecordId ?? stale[0].id,
          summary: removed === 1
            ? `${actorLabel(options.actor)} removed client-care record ${stale[0].clientName} because the lead left Won`
            : `${actorLabel(options.actor)} removed ${removed} client-care records after leads left Won (${names}${more})`,
        });
      }
    }

    return { created, removed };
  } catch {
    return { created: 0, removed: 0 };
  }
}
