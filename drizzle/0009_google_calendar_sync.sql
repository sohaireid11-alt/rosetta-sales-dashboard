CREATE TABLE `calendar_event_mappings` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`entity_type` text NOT NULL,
	`entity_id` integer NOT NULL,
	`google_event_id` text NOT NULL,
	`calendar_id` text NOT NULL,
	`follow_up_date` text,
	`last_synced_at` text NOT NULL,
	`last_error` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_calendar_event_mappings_entity` ON `calendar_event_mappings` (`entity_type`,`entity_id`);--> statement-breakpoint
CREATE TABLE `google_oauth_connections` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`account_email` text DEFAULT '' NOT NULL,
	`encrypted_refresh_token` text NOT NULL,
	`encrypted_access_token` text DEFAULT '' NOT NULL,
	`access_token_expires_at` text,
	`scopes` text DEFAULT '' NOT NULL,
	`connected_at` text NOT NULL,
	`updated_at` text NOT NULL
);
