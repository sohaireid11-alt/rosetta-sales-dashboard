export const STATUSES = ["New", "Pending", "Won", "Lost", "Canceled"] as const;
export const SOURCE_TYPES = [
  "Direct enquiry",
  "Team referral",
  "External client referral",
  "Partner",
  "Website",
  "LinkedIn",
  "Event",
  "PRF88",
  "Other",
] as const;
export const SERVICES = [
  "Scheduled Interpretation",
  "On-Demand Interpretation Hub",
  "Interpretation Equipment Rental",
  "Translation and Proofreading of Documents",
  "Transcription",
  "Voice Over",
  "Other service",
] as const;
export const INTERPRETATION_DELIVERIES = ["In-person", "Virtual"] as const;
export const INTERPRETATION_MODES = ["Consecutive", "Simultaneous"] as const;
export const MEETING_STAGES = [
  "No meeting yet",
  "Initial meeting",
  "Second / pitch meeting",
  "Close-the-deal meeting",
] as const;
export const FOLLOW_UP_ACTIONS = [
  "Call",
  "Email",
  "Send proposal",
  "Send presentation & price list",
  "Book meeting",
  "Follow up after no response",
  "Client check-in",
  "Other",
] as const;
export const OPPORTUNITY_TYPES = [
  "One-time project",
  "Recurring client",
  "Ongoing vendor relationship",
] as const;
export const ORGANIZATION_TYPES = [
  "Municipal Government",
  "State Government",
  "Non-Profit",
  "Education",
  "Healthcare",
  "Business",
  "Individual",
  "Other",
] as const;
export const ACTIVITY_TYPES = [
  "Note",
  "Triage call completed",
  "Presentation & price list emailed",
  "Proposal sent",
  "Meeting booked",
  "Follow-up completed",
] as const;
export const SATISFACTION_STATUSES = [
  "Healthy",
  "Needs attention",
  "At risk",
  "Expansion opportunity",
] as const;
export const RELATIONSHIP_TYPES = [
  "One-time client",
  "Recurring client",
  "Ongoing vendor relationship",
] as const;

export const FIELD_LIST_KEYS = [
  "statuses",
  "sourceTypes",
  "services",
  "interpretationDeliveries",
  "interpretationModes",
  "meetingStages",
  "followUpActions",
  "opportunityTypes",
  "organizationTypes",
  "activityTypes",
  "satisfactionStatuses",
  "relationshipTypes",
] as const;

export type FieldListKey = (typeof FIELD_LIST_KEYS)[number];

export const FIELD_LIST_DEFAULTS: Record<FieldListKey, readonly string[]> = {
  statuses: STATUSES,
  sourceTypes: SOURCE_TYPES,
  services: SERVICES,
  interpretationDeliveries: INTERPRETATION_DELIVERIES,
  interpretationModes: INTERPRETATION_MODES,
  meetingStages: MEETING_STAGES,
  followUpActions: FOLLOW_UP_ACTIONS,
  opportunityTypes: OPPORTUNITY_TYPES,
  organizationTypes: ORGANIZATION_TYPES,
  activityTypes: ACTIVITY_TYPES,
  satisfactionStatuses: SATISFACTION_STATUSES,
  relationshipTypes: RELATIONSHIP_TYPES,
};

export const FIELD_LIST_META: Record<FieldListKey, { title: string; description: string }> = {
  statuses: { title: "Lead statuses", description: "Dropdown choices for pipeline stage on sales records." },
  sourceTypes: { title: "Source types", description: "Dropdown choices for how a lead first reached Rosetta." },
  services: { title: "Services", description: "Dropdown choices for service lines on new and edited sales records." },
  interpretationDeliveries: { title: "Interpretation delivery", description: "Dropdown choices for in-person or virtual delivery." },
  interpretationModes: { title: "Interpretation modes", description: "Dropdown choices for consecutive or simultaneous interpretation." },
  meetingStages: { title: "Meeting stages", description: "Dropdown choices for where the conversation stands with a lead." },
  followUpActions: { title: "Follow-up actions", description: "Dropdown choices for next actions on sales records and client care." },
  opportunityTypes: { title: "Opportunity types", description: "Dropdown choices for the kind of commercial relationship." },
  organizationTypes: { title: "Organization types", description: "Dropdown choices for the kind of organization behind a lead." },
  activityTypes: { title: "Activity types", description: "Dropdown choices for activity history on a sales record." },
  satisfactionStatuses: { title: "Satisfaction statuses", description: "Dropdown choices for client-care health ratings." },
  relationshipTypes: { title: "Relationship types", description: "Dropdown choices for how an active client works with Rosetta." },
};

export const UI_LABEL_KEYS = [
  "productName",
  "tabOverview",
  "tabSalesRecords",
  "tabClientCare",
  "headingOverview",
  "headingSalesRecords",
  "headingClientCare",
  "ctaAddSalesRecord",
  "ctaAddClientFollowUp",
] as const;

export type UiLabelKey = (typeof UI_LABEL_KEYS)[number];

export const DEFAULT_UI_LABELS: Record<UiLabelKey, string> = {
  productName: "Sales performance",
  tabOverview: "Overview",
  tabSalesRecords: "Sales records",
  tabClientCare: "Client care",
  headingOverview: "Sales performance",
  headingSalesRecords: "Sales records",
  headingClientCare: "Client care",
  ctaAddSalesRecord: "Add sales record",
  ctaAddClientFollowUp: "Add client follow-up",
};

export const UI_LABEL_META: Record<UiLabelKey, { title: string; hint: string }> = {
  productName: { title: "Top bar product name", hint: "Shown next to the Rosetta logo on the dashboard." },
  tabOverview: { title: "Overview tab", hint: "First dashboard tab." },
  tabSalesRecords: { title: "Sales records tab", hint: "Second dashboard tab." },
  tabClientCare: { title: "Client care tab", hint: "Third dashboard tab." },
  headingOverview: { title: "Overview heading", hint: "Main heading on the Overview tab." },
  headingSalesRecords: { title: "Sales records heading", hint: "Main heading on the Sales records tab." },
  headingClientCare: { title: "Client care heading", hint: "Main heading on the Client care tab." },
  ctaAddSalesRecord: { title: "Add sales record button", hint: "Primary button on Overview and Sales records." },
  ctaAddClientFollowUp: { title: "Add client follow-up button", hint: "Primary button on Client care." },
};

export const SCHEDULED_INTERPRETATION_SERVICE = "Scheduled Interpretation";
export const PENDING_STAGE = "Pending";
export const WON_STAGE = "Won";
export const CLOSED_STAGES = ["Won", "Lost", "Canceled"] as const;
export const CARE_ATTENTION_STATUSES = ["Needs attention", "At risk"] as const;
