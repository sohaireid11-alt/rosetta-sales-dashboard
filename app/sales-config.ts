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
