import { DEFAULT_FIELD_DEFINITIONS, findFieldDefinition, visibleEntityFields, type FieldDefinition } from "../admin-catalog";
import { firstActiveValue, type FieldSettings } from "./field-settings-core";
import { formValueForType, includesChoice, parseStoredValues } from "./field-values";
import { PENDING_STAGE, SCHEDULED_INTERPRETATION_SERVICE } from "../sales-config";

export type FormValue = string | string[];
export type SalesFormValues = Record<string, FormValue>;

const SALES_DEFAULTS: Record<string, string> = {
  leadName: "",
  company: "",
  organizationType: "Individual",
  sourceType: "Direct enquiry",
  referredBy: "",
  requestReceivedBy: "Admin",
  service: SCHEDULED_INTERPRETATION_SERVICE,
  serviceDelivery: "In-person",
  interpretationMode: "Consecutive",
  opportunityType: "One-time project",
  stage: "New",
  contactName: "",
  contactTitle: "",
  contactEmail: "",
  contactPhone: "",
  meetingStage: "No meeting yet",
  nextMeetingAt: "",
  nextFollowUpAt: "",
  nextAction: "",
  dealValue: "",
  createdAt: "",
  closedAt: "",
  initialNote: "",
};

export function salesFields(settings: FieldSettings, contributorOnly = false) {
  const fields = settings.fields.length ? settings.fields : DEFAULT_FIELD_DEFINITIONS;
  return visibleEntityFields(fields, "sales_record", contributorOnly);
}

export function careFields(settings: FieldSettings) {
  const fields = settings.fields.length ? settings.fields : DEFAULT_FIELD_DEFINITIONS;
  return visibleEntityFields(fields, "client_follow_up");
}

export function fieldOf(settings: FieldSettings, entity: FieldDefinition["entity"], fieldKey: string) {
  return findFieldDefinition(settings.fields.length ? settings.fields : DEFAULT_FIELD_DEFINITIONS, entity, fieldKey);
}

export function emptySalesValues(settings: FieldSettings, extras: { requestReceivedBy?: string; createdAt?: string } = {}): SalesFormValues {
  const values: SalesFormValues = { ...SALES_DEFAULTS, createdAt: extras.createdAt ?? "", requestReceivedBy: extras.requestReceivedBy ?? "Admin" };
  for (const field of settings.fields.length ? settings.fields : DEFAULT_FIELD_DEFINITIONS) {
    if (field.entity !== "sales_record") continue;
    if (field.fieldKey === "requestReceivedBy") {
      values[field.fieldKey] = extras.requestReceivedBy ?? "Admin";
      continue;
    }
    if (field.fieldKey === "createdAt") {
      values[field.fieldKey] = extras.createdAt ?? "";
      continue;
    }
    if (field.inputType === "multiselect") {
      const fallback = field.listKey
        ? firstActiveValue(settings.lists[field.listKey], SALES_DEFAULTS[field.fieldKey] ?? "")
        : SALES_DEFAULTS[field.fieldKey] ?? "";
      values[field.fieldKey] = fallback ? [fallback] : [];
      continue;
    }
    if (field.listKey) {
      values[field.fieldKey] = firstActiveValue(settings.lists[field.listKey], SALES_DEFAULTS[field.fieldKey] ?? "");
      continue;
    }
    values[field.fieldKey] = SALES_DEFAULTS[field.fieldKey] ?? "";
  }
  const service = values.service;
  if (!includesChoice(service, SCHEDULED_INTERPRETATION_SERVICE)) {
    values.serviceDelivery = "";
    values.interpretationMode = "";
  }
  return values;
}

export function recordToSalesValues(record: Record<string, unknown>, settings: FieldSettings): SalesFormValues {
  const values = emptySalesValues(settings, {
    requestReceivedBy: typeof record.requestReceivedBy === "string" ? record.requestReceivedBy : "Admin",
    createdAt: typeof record.createdAt === "string" ? record.createdAt : "",
  });
  for (const field of settings.fields.length ? settings.fields : DEFAULT_FIELD_DEFINITIONS) {
    if (field.entity !== "sales_record") continue;
    if (field.fieldKey === "dealValue") {
      values.dealValue = record.estimatedRevenueCents === undefined || record.estimatedRevenueCents === null
        ? ""
        : String(Number(record.estimatedRevenueCents) / 100);
      continue;
    }
    if (field.fieldKey === "initialNote") {
      values.initialNote = "";
      continue;
    }
    const stored = record[field.storageColumn] ?? record[field.fieldKey];
    if (stored === undefined || stored === null) continue;
    values[field.fieldKey] = formValueForType(stored, field.inputType);
  }
  return values;
}

export function showSalesField(field: FieldDefinition, values: SalesFormValues, isEditing: boolean) {
  if (!field.isActive) return false;
  if (field.fieldKey === "initialNote" && isEditing) return false;
  if (field.fieldKey === "serviceDelivery" || field.fieldKey === "interpretationMode") {
    return includesChoice(values.service, SCHEDULED_INTERPRETATION_SERVICE);
  }
  return true;
}

export function salesFieldRequired(field: FieldDefinition, values: SalesFormValues) {
  if (field.fieldKey === "nextFollowUpAt" || field.fieldKey === "nextAction") {
    return field.isRequired || includesChoice(values.stage, PENDING_STAGE);
  }
  return field.isRequired;
}

export function applySalesFieldChange(values: SalesFormValues, field: FieldDefinition, next: FormValue, settings: FieldSettings): SalesFormValues {
  const updated = { ...values, [field.fieldKey]: next };
  if (field.fieldKey !== "service") return updated;
  if (includesChoice(next, SCHEDULED_INTERPRETATION_SERVICE)) {
    updated.serviceDelivery = values.serviceDelivery || firstActiveValue(settings.lists.interpretationDeliveries, "In-person");
    updated.interpretationMode = values.interpretationMode || firstActiveValue(settings.lists.interpretationModes, "Consecutive");
  } else {
    updated.serviceDelivery = "";
    updated.interpretationMode = "";
  }
  return updated;
}

export function payloadFromSalesValues(values: SalesFormValues) {
  const dealValue = typeof values.dealValue === "string" ? Number(values.dealValue) : Number(parseStoredValues(values.dealValue)[0] ?? 0);
  return { ...values, dealValue };
}

export function columnVisible(settings: FieldSettings, viewKey: "sales_records" | "client_care", columnKey: string) {
  const column = settings.views[viewKey]?.find((item) => item.columnKey === columnKey);
  return column ? column.isVisible : true;
}

export function columnLabel(settings: FieldSettings, viewKey: "sales_records" | "client_care", columnKey: string, fallback: string) {
  return settings.views[viewKey]?.find((item) => item.columnKey === columnKey)?.label ?? fallback;
}

export function sectionTitle(settings: FieldSettings, sectionKey: string, fallback: string) {
  return settings.sections[sectionKey as keyof typeof settings.sections] ?? fallback;
}
