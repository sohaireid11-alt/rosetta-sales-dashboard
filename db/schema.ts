import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const salesRecords = sqliteTable(
  "sales_records",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    leadName: text("lead_name").notNull(),
    company: text("company").notNull().default(""),
    organizationType: text("organization_type").notNull().default("Individual"),
    sourceType: text("source").notNull(),
    legacyOwner: text("owner").notNull(),
    referredBy: text("referred_by").notNull().default(""),
    requestReceivedBy: text("request_received_by").notNull().default("Admin"),
    service: text("service").notNull(),
    serviceDelivery: text("service_delivery").notNull().default(""),
    interpretationMode: text("interpretation_mode").notNull().default(""),
    opportunityType: text("opportunity_type").notNull().default("One-time project"),
    stage: text("stage").notNull(),
    contactName: text("contact_name").notNull().default(""),
    contactTitle: text("contact_title").notNull().default(""),
    contactEmail: text("contact_email").notNull().default(""),
    contactPhone: text("contact_phone").notNull().default(""),
    meetingStage: text("meeting_stage").notNull().default("No meeting yet"),
    nextMeetingAt: text("next_meeting_at"),
    nextFollowUpAt: text("next_follow_up_at"),
    nextAction: text("next_action").notNull().default(""),
    estimatedRevenueCents: integer("estimated_revenue_cents").notNull().default(0),
    bookedRevenueCents: integer("booked_revenue_cents").notNull().default(0),
    createdAt: text("created_at").notNull(),
    closedAt: text("closed_at"),
    // Retained in the physical table only so legacy D1 records migrate without loss.
    legacyPaymentStatus: text("payment_status").notNull().default("Not recorded"),
    legacyNotes: text("notes").notNull().default(""),
  },
  (table) => [
    index("idx_sales_records_created_at").on(table.createdAt),
    index("idx_sales_records_request_received_created_at").on(table.requestReceivedBy, table.createdAt),
    index("idx_sales_records_stage").on(table.stage),
    index("idx_sales_records_next_follow_up_at").on(table.nextFollowUpAt),
  ]
);

export const salesRecordActivities = sqliteTable(
  "sales_record_activities",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    salesRecordId: integer("sales_record_id").notNull(),
    activityType: text("activity_type").notNull(),
    content: text("content").notNull(),
    createdAt: text("created_at").notNull(),
  },
  (table) => [
    index("idx_sales_record_activities_record_created_at").on(table.salesRecordId, table.createdAt),
  ]
);

export const teamMembers = sqliteTable(
  "team_members",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    name: text("name").notNull(),
    email: text("email").notNull().unique(),
    role: text("role").notNull(),
    isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
    createdAt: text("created_at").notNull(),
  },
  (table) => [index("idx_team_members_active").on(table.isActive)]
);

export const clientFollowUps = sqliteTable(
  "client_follow_ups",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    salesRecordId: integer("sales_record_id"),
    clientName: text("client_name").notNull(),
    relationshipType: text("relationship_type").notNull(),
    lastEngagementAt: text("last_engagement_at"),
    lastCheckInAt: text("last_check_in_at"),
    satisfactionStatus: text("satisfaction_status").notNull(),
    nextFollowUpAt: text("next_follow_up_at"),
    nextAction: text("next_action").notNull().default(""),
    expansionOpportunity: text("expansion_opportunity").notNull().default(""),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    uniqueIndex("idx_client_follow_ups_sales_record_id").on(table.salesRecordId),
    index("idx_client_follow_ups_next_follow_up_at").on(table.nextFollowUpAt),
    index("idx_client_follow_ups_satisfaction_status").on(table.satisfactionStatus),
  ]
);

export const appUsers = sqliteTable(
  "app_users",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    email: text("email").notNull().unique(),
    displayName: text("display_name").notNull(),
    role: text("role").notNull(),
    passwordHash: text("password_hash").notNull().default(""),
    mustChangePassword: integer("must_change_password", { mode: "boolean" }).notNull().default(false),
    isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
    createdAt: text("created_at").notNull(),
    lastLoginAt: text("last_login_at").notNull(),
  },
  (table) => [
    index("idx_app_users_active").on(table.isActive),
    index("idx_app_users_role").on(table.role),
  ]
);

export const accessInvitations = sqliteTable(
  "access_invitations",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    email: text("email").notNull().unique(),
    displayName: text("display_name").notNull(),
    role: text("role").notNull(),
    tokenHash: text("token_hash").notNull(),
    expiresAt: text("expires_at").notNull(),
    acceptedAt: text("accepted_at"),
    revokedAt: text("revoked_at"),
    sentAt: text("sent_at").notNull(),
    createdAt: text("created_at").notNull(),
  },
  (table) => [
    index("idx_access_invitations_expires_at").on(table.expiresAt),
    index("idx_access_invitations_active").on(table.revokedAt, table.acceptedAt),
  ]
);

export const appFieldOptions = sqliteTable(
  "app_field_options",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    listKey: text("list_key").notNull(),
    optionValue: text("option_value").notNull(),
    optionLabel: text("option_label").notNull(),
    sortOrder: integer("sort_order").notNull().default(0),
    isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    uniqueIndex("idx_app_field_options_list_value").on(table.listKey, table.optionValue),
    index("idx_app_field_options_list_sort").on(table.listKey, table.sortOrder),
  ]
);

export const appSettings = sqliteTable("app_settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const appFieldDefinitions = sqliteTable(
  "app_field_definitions",
  {
    entity: text("entity").notNull(),
    fieldKey: text("field_key").notNull(),
    label: text("label").notNull(),
    helpText: text("help_text").notNull().default(""),
    inputType: text("input_type").notNull(),
    isRequired: integer("is_required", { mode: "boolean" }).notNull().default(false),
    isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
    sortOrder: integer("sort_order").notNull().default(0),
    sectionKey: text("section_key").notNull(),
    listKey: text("list_key"),
    storageColumn: text("storage_column").notNull(),
    showOnContributor: integer("show_on_contributor", { mode: "boolean" }).notNull().default(false),
    typeLocked: integer("type_locked", { mode: "boolean" }).notNull().default(false),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    uniqueIndex("idx_app_field_definitions_entity_key").on(table.entity, table.fieldKey),
    index("idx_app_field_definitions_entity_sort").on(table.entity, table.sortOrder),
  ]
);

export const auditEvents = sqliteTable(
  "audit_events",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    createdAt: text("created_at").notNull(),
    actorUserId: integer("actor_user_id"),
    actorEmail: text("actor_email").notNull().default(""),
    actorDisplayName: text("actor_display_name").notNull(),
    actionType: text("action_type").notNull(),
    entityType: text("entity_type").notNull(),
    entityId: text("entity_id"),
    summary: text("summary").notNull(),
  },
  (table) => [
    index("idx_audit_events_created_at").on(table.createdAt),
    index("idx_audit_events_actor_created_at").on(table.actorUserId, table.createdAt),
  ]
);

export const appViewColumns = sqliteTable(
  "app_view_columns",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    viewKey: text("view_key").notNull(),
    columnKey: text("column_key").notNull(),
    label: text("label").notNull(),
    isVisible: integer("is_visible", { mode: "boolean" }).notNull().default(true),
    sortOrder: integer("sort_order").notNull().default(0),
    isLocked: integer("is_locked", { mode: "boolean" }).notNull().default(false),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    uniqueIndex("idx_app_view_columns_view_column").on(table.viewKey, table.columnKey),
    index("idx_app_view_columns_view_sort").on(table.viewKey, table.sortOrder),
  ]
);

export const calendarEventMappings = sqliteTable(
  "calendar_event_mappings",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    entityType: text("entity_type").notNull(),
    entityId: integer("entity_id").notNull(),
    googleEventId: text("google_event_id").notNull(),
    calendarId: text("calendar_id").notNull(),
    followUpDate: text("follow_up_date"),
    lastSyncedAt: text("last_synced_at").notNull(),
    lastError: text("last_error"),
  },
  (table) => [
    uniqueIndex("idx_calendar_event_mappings_entity").on(table.entityType, table.entityId),
  ]
);

export const googleOauthConnections = sqliteTable("google_oauth_connections", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  accountEmail: text("account_email").notNull().default(""),
  encryptedRefreshToken: text("encrypted_refresh_token").notNull(),
  encryptedAccessToken: text("encrypted_access_token").notNull().default(""),
  accessTokenExpiresAt: text("access_token_expires_at"),
  scopes: text("scopes").notNull().default(""),
  connectedAt: text("connected_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});
