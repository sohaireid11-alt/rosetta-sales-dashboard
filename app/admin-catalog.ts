import type { FieldListKey } from "./sales-config";

export const FIELD_INPUT_TYPES = [
  "text",
  "textarea",
  "number",
  "date",
  "select",
  "multiselect",
  "checkbox",
] as const;

export type FieldInputType = (typeof FIELD_INPUT_TYPES)[number];
export const FIELD_ENTITIES = ["sales_record", "client_follow_up", "activity"] as const;
export type FieldEntity = (typeof FIELD_ENTITIES)[number];

export type FieldDefinition = {
  fieldKey: string;
  entity: FieldEntity;
  label: string;
  helpText: string;
  inputType: FieldInputType;
  isRequired: boolean;
  isActive: boolean;
  sortOrder: number;
  sectionKey: string;
  listKey: FieldListKey | null;
  storageColumn: string;
  showOnContributor: boolean;
  typeLocked: boolean;
};

export const FIELD_SECTION_KEYS = [
  "sales_lead",
  "sales_contact",
  "sales_service",
  "sales_next",
  "care_relationship",
  "care_checkin",
  "activity_entry",
] as const;

export type FieldSectionKey = (typeof FIELD_SECTION_KEYS)[number];

export const DEFAULT_FIELD_SECTIONS: Record<FieldSectionKey, { entity: FieldEntity; title: string; sortOrder: number }> = {
  sales_lead: { entity: "sales_record", title: "Lead and referral", sortOrder: 0 },
  sales_contact: { entity: "sales_record", title: "Contact person", sortOrder: 1 },
  sales_service: { entity: "sales_record", title: "Service and opportunity", sortOrder: 2 },
  sales_next: { entity: "sales_record", title: "Meetings and next step", sortOrder: 3 },
  care_relationship: { entity: "client_follow_up", title: "Relationship", sortOrder: 0 },
  care_checkin: { entity: "client_follow_up", title: "Satisfaction check-in", sortOrder: 1 },
  activity_entry: { entity: "activity", title: "Activity", sortOrder: 0 },
};

function field(
  fieldKey: string,
  entity: FieldEntity,
  sectionKey: FieldSectionKey,
  sortOrder: number,
  label: string,
  inputType: FieldInputType,
  extras: Partial<Omit<FieldDefinition, "fieldKey" | "entity" | "sectionKey" | "sortOrder" | "label" | "inputType" | "storageColumn">> & {
    listKey?: FieldListKey | null;
    storageColumn?: string;
    helpText?: string;
  } = {}
): FieldDefinition {
  return {
    fieldKey,
    entity,
    label,
    helpText: extras.helpText ?? "",
    inputType,
    isRequired: extras.isRequired ?? false,
    isActive: extras.isActive ?? true,
    sortOrder,
    sectionKey,
    listKey: extras.listKey ?? null,
    storageColumn: extras.storageColumn ?? fieldKey,
    showOnContributor: extras.showOnContributor ?? entity === "sales_record",
    typeLocked: extras.typeLocked ?? false,
  };
}

export const DEFAULT_FIELD_DEFINITIONS: FieldDefinition[] = [
  field("leadName", "sales_record", "sales_lead", 0, "Lead name", "text", { isRequired: true, typeLocked: true, helpText: "Person or organization." }),
  field("company", "sales_record", "sales_lead", 1, "Company", "text", { helpText: "Organization name." }),
  field("organizationType", "sales_record", "sales_lead", 2, "Organization type", "select", { isRequired: true, listKey: "organizationTypes" }),
  field("requestReceivedBy", "sales_record", "sales_lead", 3, "Request received by", "select", { isRequired: true, typeLocked: true, helpText: "People come from Team access. Add teammates there — not here." }),
  field("sourceType", "sales_record", "sales_lead", 4, "Source type", "select", { isRequired: true, listKey: "sourceTypes", helpText: "Change this to multi-select if one lead can have several sources." }),
  field("referredBy", "sales_record", "sales_lead", 5, "Referred by", "text", { helpText: "Person, client, or partner." }),
  field("contactName", "sales_record", "sales_contact", 0, "Full name", "text", { helpText: "Main contact." }),
  field("contactTitle", "sales_record", "sales_contact", 1, "Title", "text", { helpText: "Role or department." }),
  field("contactEmail", "sales_record", "sales_contact", 2, "Email", "text", { typeLocked: true, helpText: "name@organization.org" }),
  field("contactPhone", "sales_record", "sales_contact", 3, "Phone", "text", { helpText: "Phone number." }),
  field("service", "sales_record", "sales_service", 0, "Service", "select", { isRequired: true, listKey: "services", helpText: "Change this to multi-select if a lead can need more than one service." }),
  field("opportunityType", "sales_record", "sales_service", 1, "Opportunity type", "select", { isRequired: true, listKey: "opportunityTypes" }),
  field("serviceDelivery", "sales_record", "sales_service", 2, "Delivery", "select", { listKey: "interpretationDeliveries", helpText: "Shown when Scheduled Interpretation is selected." }),
  field("interpretationMode", "sales_record", "sales_service", 3, "Interpretation mode", "select", { listKey: "interpretationModes", helpText: "Shown when Scheduled Interpretation is selected." }),
  field("stage", "sales_record", "sales_service", 4, "Status", "select", { isRequired: true, typeLocked: true, listKey: "statuses", helpText: "Pipeline status stays a single choice so won/pending rules keep working." }),
  field("dealValue", "sales_record", "sales_service", 5, "Deal value (USD)", "number", { isRequired: true, typeLocked: true }),
  field("createdAt", "sales_record", "sales_service", 6, "Lead date", "date", { isRequired: true, typeLocked: true }),
  field("closedAt", "sales_record", "sales_service", 7, "Close date", "date", { typeLocked: true }),
  field("meetingStage", "sales_record", "sales_next", 0, "Meeting stage", "select", { isRequired: true, listKey: "meetingStages" }),
  field("nextMeetingAt", "sales_record", "sales_next", 1, "Next meeting date", "date", { typeLocked: true }),
  field("nextFollowUpAt", "sales_record", "sales_next", 2, "Date of next follow-up", "date", { typeLocked: true, helpText: "Required when status is Pending." }),
  field("nextAction", "sales_record", "sales_next", 3, "Action needed", "select", { listKey: "followUpActions", helpText: "Required when status is Pending. Switch to multi-select to assign several next steps." }),
  field("initialNote", "sales_record", "sales_next", 4, "First activity note", "textarea", { typeLocked: true, helpText: "Saved as its own dated activity. Shown only when adding a record." }),
  field("salesRecordId", "client_follow_up", "care_relationship", 0, "Linked won lead", "select", { typeLocked: true, showOnContributor: false, helpText: "Optional link to a won sales record." }),
  field("clientName", "client_follow_up", "care_relationship", 1, "Client name", "text", { isRequired: true, typeLocked: true, showOnContributor: false }),
  field("relationshipType", "client_follow_up", "care_relationship", 2, "Relationship type", "select", { isRequired: true, listKey: "relationshipTypes", showOnContributor: false }),
  field("lastEngagementAt", "client_follow_up", "care_relationship", 3, "Last service date", "date", { typeLocked: true, showOnContributor: false }),
  field("satisfactionStatus", "client_follow_up", "care_checkin", 0, "Satisfaction status", "select", { isRequired: true, listKey: "satisfactionStatuses", showOnContributor: false }),
  field("lastCheckInAt", "client_follow_up", "care_checkin", 1, "Last satisfaction check-in", "date", { typeLocked: true, showOnContributor: false }),
  field("nextFollowUpAt", "client_follow_up", "care_checkin", 2, "Next follow-up date", "date", { typeLocked: true, showOnContributor: false, storageColumn: "nextFollowUpAt" }),
  field("nextAction", "client_follow_up", "care_checkin", 3, "Next action", "select", { listKey: "followUpActions", showOnContributor: false }),
  field("expansionOpportunity", "client_follow_up", "care_checkin", 4, "Expansion opportunity", "textarea", { showOnContributor: false, helpText: "Potential next service, renewal, referral, or expansion." }),
  field("activityType", "activity", "activity_entry", 0, "Activity type", "select", { isRequired: true, listKey: "activityTypes", typeLocked: true, showOnContributor: false }),
  field("content", "activity", "activity_entry", 1, "New note", "textarea", { isRequired: true, typeLocked: true, showOnContributor: false }),
];

export const VIEW_KEYS = ["sales_records", "client_care"] as const;
export type ViewKey = (typeof VIEW_KEYS)[number];

export type ViewColumn = {
  viewKey: ViewKey;
  columnKey: string;
  label: string;
  isVisible: boolean;
  sortOrder: number;
  isLocked: boolean;
};

export const DEFAULT_VIEW_COLUMNS: ViewColumn[] = [
  { viewKey: "sales_records", columnKey: "leadContact", label: "Lead & contact", isVisible: true, sortOrder: 0, isLocked: true },
  { viewKey: "sales_records", columnKey: "service", label: "Service", isVisible: true, sortOrder: 1, isLocked: false },
  { viewKey: "sales_records", columnKey: "statusMeeting", label: "Status & meeting", isVisible: true, sortOrder: 2, isLocked: false },
  { viewKey: "sales_records", columnKey: "nextAction", label: "Next action", isVisible: true, sortOrder: 3, isLocked: false },
  { viewKey: "sales_records", columnKey: "source", label: "Source", isVisible: true, sortOrder: 4, isLocked: false },
  { viewKey: "sales_records", columnKey: "value", label: "Value", isVisible: true, sortOrder: 5, isLocked: false },
  { viewKey: "sales_records", columnKey: "actions", label: "Actions", isVisible: true, sortOrder: 6, isLocked: true },
  { viewKey: "client_care", columnKey: "client", label: "Client", isVisible: true, sortOrder: 0, isLocked: true },
  { viewKey: "client_care", columnKey: "relationship", label: "Relationship", isVisible: true, sortOrder: 1, isLocked: false },
  { viewKey: "client_care", columnKey: "satisfaction", label: "Satisfaction", isVisible: true, sortOrder: 2, isLocked: false },
  { viewKey: "client_care", columnKey: "lastCheckIn", label: "Last check-in", isVisible: true, sortOrder: 3, isLocked: false },
  { viewKey: "client_care", columnKey: "nextAction", label: "Next action", isVisible: true, sortOrder: 4, isLocked: false },
  { viewKey: "client_care", columnKey: "nextFollowUp", label: "Next follow-up", isVisible: true, sortOrder: 5, isLocked: false },
  { viewKey: "client_care", columnKey: "actions", label: "Actions", isVisible: true, sortOrder: 6, isLocked: true },
];

export const VIEW_META: Record<ViewKey, { title: string; description: string }> = {
  sales_records: { title: "Sales records table", description: "Columns on the Sales records tab. Hidden columns stay in exports and forms." },
  client_care: { title: "Client care table", description: "Columns on the Client care tab. Hidden columns stay in the follow-up form." },
};

export const COMING_NEXT = [
  { title: "Add brand-new fields without a deploy", detail: "Admins can already relabel, hide, reorder, and change types on every existing form field. Creating a new database column from this screen is next." },
  { title: "Visual conditional rules", detail: "Scheduled Interpretation still reveals delivery and mode automatically. A no-code rule builder for other show/hide logic is next." },
  { title: "Editable pipeline rules", detail: "Pending still requires a next action and date; Won still books revenue. Those business rules will move into this console." },
  { title: "Sign-in page wording", detail: "The sign-in screen loads before settings, so its copy stays in code until a public labels endpoint exists." },
  { title: "Chart formulas and metric math", detail: "Metric titles are editable now. Changing how booked revenue or win rate is calculated still needs a developer." },
  { title: "CSV column mapping", detail: "Import and export keep working. Mapping spreadsheet headers to fields from this screen is next." },
  { title: "Email and notification templates", detail: "Account invites and password notes are still sent by admins directly. Templates will land here. Google Calendar follow-up sync is already on the Calendar tab." },
] as const;

export function defaultFieldsByEntity(entity: FieldEntity) {
  return DEFAULT_FIELD_DEFINITIONS.filter((fieldDefinition) => fieldDefinition.entity === entity)
    .slice()
    .sort((left, right) => left.sortOrder - right.sortOrder || left.fieldKey.localeCompare(right.fieldKey));
}

export function findFieldDefinition(fields: FieldDefinition[], entity: FieldEntity, fieldKey: string) {
  return fields.find((fieldDefinition) => fieldDefinition.entity === entity && fieldDefinition.fieldKey === fieldKey)
    ?? DEFAULT_FIELD_DEFINITIONS.find((fieldDefinition) => fieldDefinition.entity === entity && fieldDefinition.fieldKey === fieldKey);
}

export function visibleEntityFields(fields: FieldDefinition[], entity: FieldEntity, contributorOnly = false) {
  return fields
    .filter((fieldDefinition) => fieldDefinition.entity === entity && fieldDefinition.isActive && (!contributorOnly || fieldDefinition.showOnContributor))
    .slice()
    .sort((left, right) => left.sortOrder - right.sortOrder || left.fieldKey.localeCompare(right.fieldKey));
}
