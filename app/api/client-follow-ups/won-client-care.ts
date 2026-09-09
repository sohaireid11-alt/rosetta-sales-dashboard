import { getDatabase } from "../../../db";
import { actorLabel, recordAuditEvent, type AuditActor } from "../../lib/audit";
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

export function isWonStage(stage: unknown) {
  return includesChoice(stage, WON_STAGE);
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

export async function ensureWonClientFollowUps(options: {
  actor?: AuditActor;
  salesRecordId?: number;
} = {}) {
  try {
    const settings = await getFieldSettings(true);
    if (!settings.includeWonLeadsInClientCare) return { created: 0 };

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
    if (!missing.length) return { created: 0 };

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
    return { created };
  } catch {
    return { created: 0 };
  }
}
