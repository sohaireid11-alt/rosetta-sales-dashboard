import { DEFAULT_FIELD_DEFINITIONS, findFieldDefinition, type FieldDefinition } from "../../admin-catalog";
import { getFieldSettings, getOptionLists } from "../field-settings/field-settings-utils";
import { includesChoice, parseStoredValues, serializeStoredValues } from "../../lib/field-values";
import {
  PENDING_STAGE,
  SCHEDULED_INTERPRETATION_SERVICE,
  STATUSES,
  WON_STAGE,
  type FieldListKey,
} from "../../sales-config";
import { getDatabase } from "../../../db";

export const STAGES = STATUSES;
export type SalesStage = string;
export type OptionLists = Record<FieldListKey, string[]>;

export type SalesRecord = {
  id: number;
  leadName: string;
  company: string;
  organizationType: string;
  sourceType: string;
  referredBy: string;
  requestReceivedBy: string;
  service: string;
  serviceDelivery: string;
  interpretationMode: string;
  opportunityType: string;
  stage: SalesStage;
  contactName: string;
  contactTitle: string;
  contactEmail: string;
  contactPhone: string;
  meetingStage: string;
  nextMeetingAt: string | null;
  nextFollowUpAt: string | null;
  nextAction: string;
  estimatedRevenueCents: number;
  bookedRevenueCents: number;
  createdAt: string;
  closedAt: string | null;
};

export type SalesActivity = {
  id: number;
  salesRecordId: number;
  activityType: string;
  content: string;
  createdAt: string;
};

export type RecordInput = Omit<SalesRecord, "id" | "bookedRevenueCents"> & { initialNote: string };
export class RecordValidationError extends Error {}

const selectColumns = `
  id, lead_name AS leadName, company, organization_type AS organizationType,
  source AS sourceType, referred_by AS referredBy, request_received_by AS requestReceivedBy,
  service, service_delivery AS serviceDelivery, interpretation_mode AS interpretationMode,
  opportunity_type AS opportunityType, stage,
  contact_name AS contactName, contact_title AS contactTitle, contact_email AS contactEmail, contact_phone AS contactPhone,
  meeting_stage AS meetingStage, next_meeting_at AS nextMeetingAt, next_follow_up_at AS nextFollowUpAt, next_action AS nextAction,
  estimated_revenue_cents AS estimatedRevenueCents, booked_revenue_cents AS bookedRevenueCents,
  created_at AS createdAt, closed_at AS closedAt
`;

function requiredText(value: unknown, label: string, limit = 100) {
  const text = typeof value === "string" ? value.trim() : "";
  if (!text) throw new RecordValidationError(`${label} is required.`);
  if (text.length > limit) throw new RecordValidationError(`${label} must be ${limit} characters or fewer.`);
  return text;
}

function optionalText(value: unknown, label = "This field", limit = 1_000) {
  const text = typeof value === "string" ? value.trim() : "";
  if (text.length > limit) throw new RecordValidationError(`${label} must be ${limit} characters or fewer.`);
  return text;
}

function moneyToCents(value: unknown) {
  const amount = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(amount) || amount < 0 || amount > 10_000_000) {
    throw new RecordValidationError("Enter a valid deal value.");
  }
  return Math.round(amount * 100);
}

function validDate(value: unknown, label: string, required: boolean) {
  const date = typeof value === "string" ? value.trim() : "";
  if (!date && !required) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new RecordValidationError(`${label} must be a valid date.`);
  return date;
}

function oneOf(value: unknown, options: readonly string[], label: string, fallback?: string) {
  const text = typeof value === "string" ? value.trim() : "";
  const selected = text || fallback;
  if (!selected || !options.includes(selected)) throw new RecordValidationError(`Choose a valid ${label}.`);
  return selected;
}

function oneOrMany(
  value: unknown,
  options: readonly string[],
  label: string,
  extras: { required?: boolean; allowMultiple?: boolean; fallback?: string } = {}
) {
  const selected = parseStoredValues(value);
  if (!selected.length && extras.fallback) selected.push(extras.fallback);
  if (!selected.length) {
    if (extras.required === false) return "";
    throw new RecordValidationError(`Choose a valid ${label}.`);
  }
  for (const choice of selected) {
    if (!options.includes(choice)) throw new RecordValidationError(`Choose a valid ${label}.`);
  }
  return serializeStoredValues(selected, extras.allowMultiple === true);
}

function choiceFromField(
  data: Record<string, unknown>,
  fieldKey: string,
  lists: OptionLists,
  fields: FieldDefinition[],
  label: string,
  extras: { required?: boolean; fallback?: string; alias?: string } = {}
) {
  const field = findFieldDefinition(fields, "sales_record", fieldKey);
  const listKey = field?.listKey;
  const options = listKey ? lists[listKey] : [];
  const raw = data[fieldKey] ?? (extras.alias ? data[extras.alias] : undefined);
  return oneOrMany(raw, options, label, {
    required: extras.required ?? field?.isRequired ?? true,
    allowMultiple: field?.inputType === "multiselect",
    fallback: extras.fallback,
  });
}

export function parseRecordInput(payload: unknown, lists: OptionLists, fields: FieldDefinition[] = DEFAULT_FIELD_DEFINITIONS): RecordInput {
  if (!payload || typeof payload !== "object") throw new RecordValidationError("A sales record is required.");
  const data = payload as Record<string, unknown>;
  const stage = choiceFromField(data, "stage", lists, fields, "status");
  const service = choiceFromField(data, "service", lists, fields, "service");
  const isScheduledInterpretation = includesChoice(service, SCHEDULED_INTERPRETATION_SERVICE);
  const serviceDelivery = isScheduledInterpretation
    ? choiceFromField(data, "serviceDelivery", lists, fields, "interpretation delivery")
    : "";
  const interpretationMode = isScheduledInterpretation
    ? choiceFromField(data, "interpretationMode", lists, fields, "interpretation mode")
    : "";
  const nextFollowUpAt = validDate(data.nextFollowUpAt, "Date of next follow-up", false);
  const nextAction = choiceFromField(data, "nextAction", lists, fields, "action needed", { required: false });
  if (includesChoice(stage, PENDING_STAGE) && (!nextFollowUpAt || !nextAction)) {
    throw new RecordValidationError("Pending leads need an action and a date of next follow-up.");
  }

  const contactEmail = optionalText(data.contactEmail, "Contact email", 160);
  if (contactEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactEmail)) {
    throw new RecordValidationError("Enter a valid contact email.");
  }

  return {
    leadName: requiredText(data.leadName, "Lead name"),
    company: optionalText(data.company, "Company", 160),
    organizationType: choiceFromField(data, "organizationType", lists, fields, "organization type", { fallback: "Individual" }),
    sourceType: choiceFromField(data, "sourceType", lists, fields, "lead source", { alias: "source" }),
    referredBy: optionalText(data.referredBy, "Referred by", 160),
    requestReceivedBy: optionalText(data.requestReceivedBy ?? data.owner, "Request received by", 80) || "Admin",
    service,
    serviceDelivery,
    interpretationMode,
    opportunityType: choiceFromField(data, "opportunityType", lists, fields, "opportunity type", { fallback: "One-time project" }),
    stage,
    contactName: optionalText(data.contactName, "Contact name", 120),
    contactTitle: optionalText(data.contactTitle, "Contact title", 120),
    contactEmail,
    contactPhone: optionalText(data.contactPhone, "Contact phone", 60),
    meetingStage: choiceFromField(data, "meetingStage", lists, fields, "meeting stage", { fallback: "No meeting yet" }),
    nextMeetingAt: validDate(data.nextMeetingAt, "Next meeting date", false),
    nextFollowUpAt,
    nextAction,
    estimatedRevenueCents: moneyToCents(data.dealValue),
    createdAt: validDate(data.createdAt, "Lead date", true) ?? "",
    closedAt: validDate(data.closedAt, "Close date", false),
    initialNote: optionalText(data.initialNote ?? data.notes, "Initial note", 2_000),
  };
}

export async function readRecordInput(payload: unknown): Promise<RecordInput> {
  const settings = await getFieldSettings(true);
  const lists = Object.fromEntries(
    (Object.keys(settings.lists) as FieldListKey[]).map((key) => [key, settings.lists[key].map((option) => option.value)])
  ) as OptionLists;
  return parseRecordInput(payload, lists, settings.fields);
}

export async function listRecords() {
  const database = await getDatabase();
  const result = await database.prepare(`SELECT ${selectColumns} FROM sales_records ORDER BY created_at DESC, id DESC`).all<SalesRecord>();
  return result.results;
}

export async function createRecord(input: RecordInput) {
  const database = await getDatabase();
  const result = await createRecordStatement(database, input).run();
  const id = Number(result.meta.last_row_id);
  if (input.initialNote) await addActivity(id, "Note", input.initialNote);
  return findRecord(id);
}

function createRecordStatement(database: D1Database, input: RecordInput) {
  const bookedRevenueCents = includesChoice(input.stage, WON_STAGE) ? input.estimatedRevenueCents : 0;
  return database.prepare(
    `INSERT INTO sales_records (
      lead_name, company, organization_type, source, owner, referred_by, request_received_by,
      service, service_delivery, interpretation_mode, opportunity_type, stage,
      contact_name, contact_title, contact_email, contact_phone, meeting_stage, next_meeting_at, next_follow_up_at, next_action,
      estimated_revenue_cents, booked_revenue_cents, created_at, closed_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(
    input.leadName, input.company, input.organizationType, input.sourceType, input.requestReceivedBy, input.referredBy, input.requestReceivedBy,
    input.service, input.serviceDelivery, input.interpretationMode, input.opportunityType, input.stage,
    input.contactName, input.contactTitle, input.contactEmail, input.contactPhone, input.meetingStage, input.nextMeetingAt, input.nextFollowUpAt, input.nextAction,
    input.estimatedRevenueCents, bookedRevenueCents, input.createdAt, input.closedAt
  );
}

export async function importRecords(inputs: RecordInput[]) {
  const database = await getDatabase();
  const batchSize = 50;
  const existingRecords = await database.prepare(
    "SELECT id, lead_name AS leadName, created_at AS createdAt FROM sales_records ORDER BY id"
  ).all<{ id: number; leadName: string; createdAt: string }>();
  const recordIdByIdentity = new Map(existingRecords.results.map((record) => [recordIdentity(record.leadName, record.createdAt), record.id]));
  const newInputs: RecordInput[] = [];

  for (const input of inputs) {
    const identity = recordIdentity(input.leadName, input.createdAt);
    if (recordIdByIdentity.has(identity)) continue;
    recordIdByIdentity.set(identity, 0);
    newInputs.push(input);
  }

  for (let index = 0; index < newInputs.length; index += batchSize) {
    await database.batch(newInputs.slice(index, index + batchSize).map((input) => createRecordStatement(database, input)));
  }

  if (newInputs.length) {
    const importedRecords = await database.prepare(
      "SELECT id, lead_name AS leadName, created_at AS createdAt FROM sales_records ORDER BY id"
    ).all<{ id: number; leadName: string; createdAt: string }>();
    for (const record of importedRecords.results) {
      recordIdByIdentity.set(recordIdentity(record.leadName, record.createdAt), record.id);
    }
  }

  let notesAdded = 0;
  for (const input of inputs) {
    if (!input.initialNote) continue;
    const salesRecordId = recordIdByIdentity.get(recordIdentity(input.leadName, input.createdAt));
    if (!salesRecordId) {
      throw new Error(`Could not find the existing record for ${input.leadName}.`);
    }
    const matchingNote = await database.prepare(
      "SELECT 1 FROM sales_record_activities WHERE sales_record_id = ? AND activity_type = 'Note' AND content = ? LIMIT 1"
    ).bind(salesRecordId, input.initialNote).first();
    if (matchingNote) continue;
    await createActivityStatement(database, salesRecordId, "Note", input.initialNote).run();
    notesAdded += 1;
  }

  return { imported: newInputs.length, existing: inputs.length - newInputs.length, notesAdded };
}

function recordIdentity(leadName: string, createdAt: string) {
  return `${leadName.trim().toLocaleLowerCase()}\u0000${createdAt}`;
}

export async function updateRecord(id: number, input: RecordInput) {
  const database = await getDatabase();
  const bookedRevenueCents = includesChoice(input.stage, WON_STAGE) ? input.estimatedRevenueCents : 0;
  await database.prepare(
    `UPDATE sales_records SET
      lead_name = ?, company = ?, organization_type = ?, source = ?, owner = ?, referred_by = ?, request_received_by = ?,
      service = ?, service_delivery = ?, interpretation_mode = ?, opportunity_type = ?, stage = ?,
      contact_name = ?, contact_title = ?, contact_email = ?, contact_phone = ?, meeting_stage = ?, next_meeting_at = ?, next_follow_up_at = ?, next_action = ?,
      estimated_revenue_cents = ?, booked_revenue_cents = ?, created_at = ?, closed_at = ?
     WHERE id = ?`
  ).bind(
    input.leadName, input.company, input.organizationType, input.sourceType, input.requestReceivedBy, input.referredBy, input.requestReceivedBy,
    input.service, input.serviceDelivery, input.interpretationMode, input.opportunityType, input.stage,
    input.contactName, input.contactTitle, input.contactEmail, input.contactPhone, input.meetingStage, input.nextMeetingAt, input.nextFollowUpAt, input.nextAction,
    input.estimatedRevenueCents, bookedRevenueCents, input.createdAt, input.closedAt, id
  ).run();
  if (input.initialNote) await addActivity(id, "Note", input.initialNote);
  return findRecord(id);
}

function keepText(primary: string, duplicate: string) {
  return primary.trim() ? primary : duplicate;
}

export async function mergeRecords(primaryId: number, duplicateIdValue: unknown) {
  const duplicateId = Number(duplicateIdValue);
  if (!Number.isInteger(duplicateId) || duplicateId < 1 || duplicateId === primaryId) {
    throw new RecordValidationError("Choose a different sales record to merge.");
  }

  const database = await getDatabase();
  const [primary, duplicate] = await Promise.all([
    database.prepare(`SELECT ${selectColumns} FROM sales_records WHERE id = ?`).bind(primaryId).first<SalesRecord>(),
    database.prepare(`SELECT ${selectColumns} FROM sales_records WHERE id = ?`).bind(duplicateId).first<SalesRecord>(),
  ]);
  if (!primary || !duplicate) throw new RecordValidationError("The sales record to merge could not be found.");

  const nextFollowUpAt = primary.nextFollowUpAt ?? duplicate.nextFollowUpAt;
  const estimatedRevenueCents = primary.estimatedRevenueCents || duplicate.estimatedRevenueCents;
  const bookedRevenueCents = includesChoice(primary.stage, WON_STAGE) ? estimatedRevenueCents : 0;
  const now = new Date().toISOString();
  const mergedCreatedAt = primary.createdAt <= duplicate.createdAt ? primary.createdAt : duplicate.createdAt;
  const mergedMeetingStage = primary.meetingStage === "No meeting yet" ? duplicate.meetingStage : primary.meetingStage;

  await database.batch([
    database.prepare(
      `UPDATE sales_records SET
        company = ?, organization_type = ?, source = ?, owner = ?, referred_by = ?, request_received_by = ?,
        service = ?, service_delivery = ?, interpretation_mode = ?, opportunity_type = ?, stage = ?,
        contact_name = ?, contact_title = ?, contact_email = ?, contact_phone = ?, meeting_stage = ?, next_meeting_at = ?, next_follow_up_at = ?, next_action = ?,
        estimated_revenue_cents = ?, booked_revenue_cents = ?, created_at = ?, closed_at = ?
       WHERE id = ?`
    ).bind(
      keepText(primary.company, duplicate.company), primary.organizationType, primary.sourceType, primary.requestReceivedBy, keepText(primary.referredBy, duplicate.referredBy), primary.requestReceivedBy,
      primary.service, primary.serviceDelivery, primary.interpretationMode, primary.opportunityType, primary.stage,
      keepText(primary.contactName, duplicate.contactName), keepText(primary.contactTitle, duplicate.contactTitle), keepText(primary.contactEmail, duplicate.contactEmail), keepText(primary.contactPhone, duplicate.contactPhone), mergedMeetingStage, primary.nextMeetingAt ?? duplicate.nextMeetingAt, nextFollowUpAt, keepText(primary.nextAction, duplicate.nextAction),
      estimatedRevenueCents, bookedRevenueCents, mergedCreatedAt, primary.closedAt ?? duplicate.closedAt, primary.id
    ),
    database.prepare("UPDATE sales_record_activities SET sales_record_id = ? WHERE sales_record_id = ?").bind(primary.id, duplicate.id),
    database.prepare("UPDATE client_follow_ups SET sales_record_id = ?, updated_at = ? WHERE sales_record_id = ?").bind(primary.id, now, duplicate.id),
    database.prepare("INSERT INTO sales_record_activities (sales_record_id, activity_type, content, created_at) VALUES (?, ?, ?, ?)").bind(primary.id, "Note", `Merged duplicate record: ${duplicate.leadName}.`, now),
    database.prepare("DELETE FROM sales_records WHERE id = ?").bind(duplicate.id),
  ]);

  return findRecord(primary.id);
}

export async function findRecord(id: number) {
  const database = await getDatabase();
  return database.prepare(`SELECT ${selectColumns} FROM sales_records WHERE id = ?`).bind(id).first<SalesRecord>();
}

export async function listActivities(salesRecordId: number) {
  const database = await getDatabase();
  const result = await database.prepare(
    "SELECT id, sales_record_id AS salesRecordId, activity_type AS activityType, content, created_at AS createdAt FROM sales_record_activities WHERE sales_record_id = ? ORDER BY created_at DESC, id DESC"
  ).bind(salesRecordId).all<SalesActivity>();
  return result.results;
}

function createActivityStatement(database: D1Database, salesRecordId: number, activityType: string, content: string) {
  return database.prepare(
    "INSERT INTO sales_record_activities (sales_record_id, activity_type, content, created_at) VALUES (?, ?, ?, ?)"
  ).bind(salesRecordId, activityType, content, new Date().toISOString());
}

export async function addActivity(salesRecordId: number, activityType: unknown, content: unknown) {
  const type = oneOf(activityType, (await getOptionLists()).activityTypes, "activity type");
  const note = requiredText(content, "Activity note", 2_000);
  const database = await getDatabase();
  const result = await createActivityStatement(database, salesRecordId, type, note).run();
  return database.prepare(
    "SELECT id, sales_record_id AS salesRecordId, activity_type AS activityType, content, created_at AS createdAt FROM sales_record_activities WHERE id = ?"
  ).bind(Number(result.meta.last_row_id)).first<SalesActivity>();
}

export async function removeRecord(id: number) {
  const database = await getDatabase();
  const result = await database.batch([
    database.prepare("DELETE FROM sales_record_activities WHERE sales_record_id = ?").bind(id),
    database.prepare("UPDATE client_follow_ups SET sales_record_id = NULL WHERE sales_record_id = ?").bind(id),
    database.prepare("DELETE FROM sales_records WHERE id = ?").bind(id),
  ]);
  return result[2].meta.changes > 0;
}

export function errorMessage(error: unknown) {
  if (error instanceof RecordValidationError) return error.message;
  const message = error instanceof Error ? error.message : "Unexpected error";
  return message.includes("no such table") ? "The sales records table is still being prepared. Please retry in a moment." : message;
}
