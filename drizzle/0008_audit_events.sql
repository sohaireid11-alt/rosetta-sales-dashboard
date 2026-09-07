CREATE TABLE `audit_events` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`created_at` text NOT NULL,
	`actor_user_id` integer,
	`actor_email` text DEFAULT '' NOT NULL,
	`actor_display_name` text NOT NULL,
	`action_type` text NOT NULL,
	`entity_type` text NOT NULL,
	`entity_id` text,
	`summary` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_audit_events_created_at` ON `audit_events` (`created_at`);--> statement-breakpoint
CREATE INDEX `idx_audit_events_actor_created_at` ON `audit_events` (`actor_user_id`,`created_at`);