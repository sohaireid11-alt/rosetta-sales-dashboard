import { FOLLOW_UP_ACTIONS, RELATIONSHIP_TYPES, SATISFACTION_STATUSES } from "../../sales-config";
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

function option<T extends readonly string[]>(value: unknown, options: T, label: string) {
  const text = requiredText(value, label, 120);
  if (!options.includes(text as T[number])) throw new ClientFollowUpValidationError(`Choose a valid ${label.toLowerCase()}.`);
  return text;
}

export function readClientFollowUpInput(payload: unknown): ClientFollowUpInput {
  if (!payload || typeof payload !== "object") throw new ClientFollowUpValidationError("A client follow-up is required.");
  const data = payload as Record<string, unknown>;
  const rawId = data.salesRecordId;
  const salesRecordId = rawId === "" || rawId === null || rawId === undefined ? null : Number(rawId);
  if (salesRecordId !== null && (!Number.isInteger(salesRecordId) || salesRecordId < 1)) {
    throw new ClientFollowUpValidationError("Choose a valid linked sales record.");
  }
  const nextAction = optionalText(data.nextAction, "Next action", 120);
  if (nextAction && !FOLLOW_UP_ACTIONS.includes(nextAction as (typeof FOLLOW_UP_ACTIONS)[number])) {
    throw new ClientFollowUpValidationError("Choose a valid next action.");
  }
  return {
    salesRecordId,
    clientName: requiredText(data.clientName, "Client name"),
    relationshipType: option(data.relationshipType, RELATIONSHIP_TYPES, "Relationship type"),
    lastEngagementAt: date(data.lastEngagementAt, "Last service date"),
    lastCheckInAt: date(data.lastCheckInAt, "Last satisfaction check-in"),
    satisfactionStatus: option(data.satisfactionStatus, SATISFACTION_STATUSES, "Satisfaction status"),
    nextFollowUpAt: date(data.nextFollowUpAt, "Next follow-up date"),
    nextAction,
    expansionOpportunity: optionalText(data.expansionOpportunity, "Expansion opportunity", 1_000),
  };
}

const selectColumns = `
  client_follow_ups.id, sales_record_id AS salesRecordId, client_name AS clientName, relationship_type AS relationshipType,
  last_engagement_at AS lastEngagementAt, last_check_in_at AS lastCheckInAt, satisfaction_status AS satisfactionStatus,
  client_follow_ups.next_follow_up_at AS nextFollowUpAt, client_follow_ups.next_action AS nextAction,
  expansion_opportunity AS expansionOpportunity, client_follow_ups.created_at AS createdAt, client_follow_ups.updated_at AS updatedAt,
  sales_records.lead_name AS linkedLeadName
`;

export async function listClientFollowUps() {
  const database = await getDatabase();
  const result = await database.prepare(
    `SELECT ${selectColumns} FROM client_follow_ups LEFT JOIN sales_records ON sales_records.id = client_follow_ups.sales_record_id ORDER BY CASE WHEN next_follow_up_at IS NULL THEN 1 ELSE 0 END, next_follow_up_at ASC, client_follow_ups.id DESC`
  ).all<ClientFollowUp>();
  return result.results;
}

export async function createClientFollowUp(input: ClientFollowUpInput) {
  const database = await getDatabase();
  const now = new Date().toISOString();
  const result = await database.prepare(
    "INSERT INTO client_follow_ups (sales_record_id, client_name, relationship_type, last_engagement_at, last_check_in_at, satisfaction_status, next_follow_up_at, next_action, expansion_opportunity, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
  ).bind(
    input.salesRecordId, input.clientName, input.relationshipType, input.lastEngagementAt, input.lastCheckInAt,
    input.satisfactionStatus, input.nextFollowUpAt, input.nextAction, input.expansionOpportunity, now, now
  ).run();
  return findClientFollowUp(Number(result.meta.last_row_id));
}

export async function updateClientFollowUp(id: number, input: ClientFollowUpInput) {
  const database = await getDatabase();
  await database.prepare(
    "UPDATE client_follow_ups SET sales_record_id = ?, client_name = ?, relationship_type = ?, last_engagement_at = ?, last_check_in_at = ?, satisfaction_status = ?, next_follow_up_at = ?, next_action = ?, expansion_opportunity = ?, updated_at = ? WHERE id = ?"
  ).bind(
    input.salesRecordId, input.clientName, input.relationshipType, input.lastEngagementAt, input.lastCheckInAt,
    input.satisfactionStatus, input.nextFollowUpAt, input.nextAction, input.expansionOpportunity, new Date().toISOString(), id
  ).run();
  return findClientFollowUp(id);
}

export async function findClientFollowUp(id: number) {
  const database = await getDatabase();
  return database.prepare(
    `SELECT ${selectColumns} FROM client_follow_ups LEFT JOIN sales_records ON sales_records.id = client_follow_ups.sales_record_id WHERE client_follow_ups.id = ?`
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
