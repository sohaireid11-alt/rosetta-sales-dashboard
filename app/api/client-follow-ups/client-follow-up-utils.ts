import { DEFAULT_FIELD_DEFINITIONS, findFieldDefinition } from "../../admin-catalog";
import { getFieldSettings, getOptionLists } from "../field-settings/field-settings-utils";
import { parseStoredValues, serializeStoredValues } from "../../lib/field-values";
import { getDatabase } from "../../../db";

export type ClientFollowUp = {
  id: number;
  salesRecordId: number | null;
  clientName: string;
  relationshipType: string;
  lastEngagementAt: string | null;
  lastCheckInAt: string | null;
  satisfactionStatus: string;
  nextFollowUpAt: string | null;
  nextAction: string;
  expansionOpportunity: string;
  createdAt: string;
  updatedAt: string;
  linkedLeadName: string | null;
};

export type ClientFollowUpInput = Omit<ClientFollowUp, "id" | "createdAt" | "updatedAt" | "linkedLeadName">;
export class ClientFollowUpValidationError extends Error {}

function requiredText(value: unknown, label: string, limit = 160) {
  const text = typeof value === "string" ? value.trim() : "";
  if (!text) throw new ClientFollowUpValidationError(`${label} is required.`);
  if (text.length > limit) throw new ClientFollowUpValidationError(`${label} must be ${limit} characters or fewer.`);
  return text;
}

function optionalText(value: unknown, label: string, limit = 1_000) {
  const text = typeof value === "string" ? value.trim() : "";
  if (text.length > limit) throw new ClientFollowUpValidationError(`${label} must be ${limit} characters or fewer.`);
  return text;
}

function date(value: unknown, label: string) {
  const valueText = typeof value === "string" ? value.trim() : "";
  if (!valueText) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(valueText)) throw new ClientFollowUpValidationError(`${label} must be a valid date.`);
  return valueText;
}

function option(value: unknown, options: readonly string[], label: string, extras: { required?: boolean; allowMultiple?: boolean } = {}) {
  const selected = parseStoredValues(value);
  if (!selected.length) {
    if (extras.required === false) return "";
    throw new ClientFollowUpValidationError(`${label} is required.`);
  }
  for (const choice of selected) {
    if (!options.includes(choice)) throw new ClientFollowUpValidationError(`Choose a valid ${label.toLowerCase()}.`);
  }
  return serializeStoredValues(selected, extras.allowMultiple === true);
}

export async function readClientFollowUpInput(payload: unknown): Promise<ClientFollowUpInput> {
  if (!payload || typeof payload !== "object") throw new ClientFollowUpValidationError("A client follow-up is required.");
  const data = payload as Record<string, unknown>;
  const settings = await getFieldSettings(true);
  const lists = await getOptionLists();
  const fields = settings.fields.length ? settings.fields : DEFAULT_FIELD_DEFINITIONS;
  const rawId = data.salesRecordId;
  const salesRecordId = rawId === "" || rawId === null || rawId === undefined ? null : Number(rawId);
  if (salesRecordId !== null && (!Number.isInteger(salesRecordId) || salesRecordId < 1)) {
    throw new ClientFollowUpValidationError("Choose a valid linked sales record.");
  }
  const nextActionField = findFieldDefinition(fields, "client_follow_up", "nextAction");
  const relationshipField = findFieldDefinition(fields, "client_follow_up", "relationshipType");
  const satisfactionField = findFieldDefinition(fields, "client_follow_up", "satisfactionStatus");
  const nextAction = option(data.nextAction, lists.followUpActions, "Next action", {
    required: false,
    allowMultiple: nextActionField?.inputType === "multiselect",
  });
  return {
    salesRecordId,
    clientName: requiredText(data.clientName, "Client name"),
    relationshipType: option(data.relationshipType, lists.relationshipTypes, "Relationship type", {
      required: relationshipField?.isRequired !== false,
      allowMultiple: relationshipField?.inputType === "multiselect",
    }),
    lastEngagementAt: date(data.lastEngagementAt, "Last service date"),
    lastCheckInAt: date(data.lastCheckInAt, "Last satisfaction check-in"),
    satisfactionStatus: option(data.satisfactionStatus, lists.satisfactionStatuses, "Satisfaction status", {
      required: satisfactionField?.isRequired !== false,
      allowMultiple: satisfactionField?.inputType === "multiselect",
    }),
    nextFollowUpAt: date(data.nextFollowUpAt, "Next follow-up date"),
    nextAction,
    expansionOpportunity: optionalText(data.expansionOpportunity, "Expansion opportunity", 1_000),
  };
}

const selectColumns = `
  client_follow_ups.id, client_follow_ups.sales_record_id AS salesRecordId, client_follow_ups.client_name AS clientName,
  client_follow_ups.relationship_type AS relationshipType, client_follow_ups.last_engagement_at AS lastEngagementAt,
  client_follow_ups.last_check_in_at AS lastCheckInAt, client_follow_ups.satisfaction_status AS satisfactionStatus,
  client_follow_ups.next_follow_up_at AS nextFollowUpAt, client_follow_ups.next_action AS nextAction,
  client_follow_ups.expansion_opportunity AS expansionOpportunity, client_follow_ups.created_at AS createdAt,
  client_follow_ups.updated_at AS updatedAt, sales_records.lead_name AS linkedLeadName
`;

const followUpJoin = "FROM client_follow_ups LEFT JOIN sales_records ON sales_records.id = client_follow_ups.sales_record_id";
const followUpListOrder = "ORDER BY CASE WHEN client_follow_ups.next_follow_up_at IS NULL THEN 1 ELSE 0 END, client_follow_ups.next_follow_up_at ASC, client_follow_ups.id DESC";

export async function listClientFollowUps() {
  const database = await getDatabase();
  const result = await database.prepare(
    `SELECT ${selectColumns} ${followUpJoin} ${followUpListOrder}`
  ).all<ClientFollowUp>();
  return result.results ?? [];
}

export async function findClientFollowUpBySalesRecordId(salesRecordId: number, exceptId?: number) {
  const database = await getDatabase();
  if (exceptId) {
    return database.prepare(
      `SELECT ${selectColumns} ${followUpJoin} WHERE client_follow_ups.sales_record_id = ? AND client_follow_ups.id != ? ORDER BY client_follow_ups.id ASC LIMIT 1`
    ).bind(salesRecordId, exceptId).first<ClientFollowUp>();
  }
  return database.prepare(
    `SELECT ${selectColumns} ${followUpJoin} WHERE client_follow_ups.sales_record_id = ? ORDER BY client_follow_ups.id ASC LIMIT 1`
  ).bind(salesRecordId).first<ClientFollowUp>();
}

async function assertUniqueSalesRecordLink(salesRecordId: number | null, exceptId?: number) {
  if (!salesRecordId) return;
  const existing = await findClientFollowUpBySalesRecordId(salesRecordId, exceptId);
  if (existing) {
    throw new ClientFollowUpValidationError("This won lead already has a client-care record.");
  }
}

export async function createClientFollowUp(input: ClientFollowUpInput) {
  await assertUniqueSalesRecordLink(input.salesRecordId);
  const database = await getDatabase();
  const now = new Date().toISOString();
  try {
    const result = await database.prepare(
      "INSERT INTO client_follow_ups (sales_record_id, client_name, relationship_type, last_engagement_at, last_check_in_at, satisfaction_status, next_follow_up_at, next_action, expansion_opportunity, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
    ).bind(
      input.salesRecordId, input.clientName, input.relationshipType, input.lastEngagementAt, input.lastCheckInAt,
      input.satisfactionStatus, input.nextFollowUpAt, input.nextAction, input.expansionOpportunity, now, now
    ).run();
    return findClientFollowUp(Number(result.meta.last_row_id));
  } catch (error) {
    if (error instanceof Error && error.message.includes("UNIQUE constraint failed")) {
      throw new ClientFollowUpValidationError("This won lead already has a client-care record.");
    }
    throw error;
  }
}

export async function updateClientFollowUp(id: number, input: ClientFollowUpInput) {
  await assertUniqueSalesRecordLink(input.salesRecordId, id);
  const database = await getDatabase();
  try {
    await database.prepare(
      "UPDATE client_follow_ups SET sales_record_id = ?, client_name = ?, relationship_type = ?, last_engagement_at = ?, last_check_in_at = ?, satisfaction_status = ?, next_follow_up_at = ?, next_action = ?, expansion_opportunity = ?, updated_at = ? WHERE id = ?"
    ).bind(
      input.salesRecordId, input.clientName, input.relationshipType, input.lastEngagementAt, input.lastCheckInAt,
      input.satisfactionStatus, input.nextFollowUpAt, input.nextAction, input.expansionOpportunity, new Date().toISOString(), id
    ).run();
  } catch (error) {
    if (error instanceof Error && error.message.includes("UNIQUE constraint failed")) {
      throw new ClientFollowUpValidationError("This won lead already has a client-care record.");
    }
    throw error;
  }
  return findClientFollowUp(id);
}

export async function findClientFollowUp(id: number) {
  const database = await getDatabase();
  return database.prepare(
    `SELECT ${selectColumns} ${followUpJoin} WHERE client_follow_ups.id = ?`
  ).bind(id).first<ClientFollowUp>();
}

export async function removeClientFollowUp(id: number) {
  const database = await getDatabase();
  const result = await database.prepare("DELETE FROM client_follow_ups WHERE id = ?").bind(id).run();
  return result.meta.changes > 0;
}

export function clientFollowUpError(error: unknown) {
  if (error instanceof ClientFollowUpValidationError) return error.message;
  return error instanceof Error ? error.message : "Unexpected error";
}
