CREATE TABLE `client_follow_ups` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`sales_record_id` integer,
	`client_name` text NOT NULL,
	`relationship_type` text NOT NULL,
	`last_engagement_at` text,
	`last_check_in_at` text,
	`satisfaction_status` text NOT NULL,
	`next_follow_up_at` text,
	`next_action` text DEFAULT '' NOT NULL,
	`expansion_opportunity` text DEFAULT '' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_client_follow_ups_next_follow_up_at` ON `client_follow_ups` (`next_follow_up_at`);--> statement-breakpoint
CREATE INDEX `idx_client_follow_ups_satisfaction_status` ON `client_follow_ups` (`satisfaction_status`);--> statement-breakpoint
CREATE TABLE `sales_record_activities` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`sales_record_id` integer NOT NULL,
	`activity_type` text NOT NULL,
	`content` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_sales_record_activities_record_created_at` ON `sales_record_activities` (`sales_record_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `team_members` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`email` text NOT NULL,
	`role` text NOT NULL,
	`is_active` integer DEFAULT true NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `team_members_email_unique` ON `team_members` (`email`);--> statement-breakpoint
CREATE INDEX `idx_team_members_active` ON `team_members` (`is_active`);--> statement-breakpoint
DROP INDEX `idx_sales_records_owner_created_at`;--> statement-breakpoint
ALTER TABLE `sales_records` ADD `referred_by` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `sales_records` ADD `request_received_by` text DEFAULT 'Admin' NOT NULL;--> statement-breakpoint
ALTER TABLE `sales_records` ADD `service_delivery` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `sales_records` ADD `interpretation_mode` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `sales_records` ADD `opportunity_type` text DEFAULT 'One-time project' NOT NULL;--> statement-breakpoint
ALTER TABLE `sales_records` ADD `contact_name` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `sales_records` ADD `contact_title` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `sales_records` ADD `contact_email` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `sales_records` ADD `contact_phone` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `sales_records` ADD `meeting_stage` text DEFAULT 'No meeting yet' NOT NULL;--> statement-breakpoint
ALTER TABLE `sales_records` ADD `next_meeting_at` text;--> statement-breakpoint
ALTER TABLE `sales_records` ADD `next_follow_up_at` text;--> statement-breakpoint
ALTER TABLE `sales_records` ADD `next_action` text DEFAULT '' NOT NULL;--> statement-breakpoint
CREATE INDEX `idx_sales_records_request_received_created_at` ON `sales_records` (`request_received_by`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_sales_records_next_follow_up_at` ON `sales_records` (`next_follow_up_at`);--> statement-breakpoint
UPDATE `sales_records` SET `request_received_by` = 'Admin' WHERE `request_received_by` = '' OR `request_received_by` IS NULL;--> statement-breakpoint
UPDATE `sales_records` SET `stage` = 'Pending' WHERE `stage` IN ('Qualified', 'Proposal');--> statement-breakpoint
UPDATE `sales_records` SET `source` = 'External client referral' WHERE `source` IN ('Referral', 'Repeat client');--> statement-breakpoint
UPDATE `sales_records` SET `service` = 'Translation and Proofreading of Documents' WHERE `service` IN ('Translation', 'Localization');--> statement-breakpoint
UPDATE `sales_records` SET `service` = 'Scheduled Interpretation' WHERE `service` = 'Interpretation';--> statement-breakpoint
UPDATE `sales_records` SET `service` = 'Other service' WHERE `service` IN ('Training', 'Other');--> statement-breakpoint
INSERT INTO `sales_record_activities` (`sales_record_id`, `activity_type`, `content`, `created_at`)
SELECT `id`, 'Note', `notes`, `created_at`
FROM `sales_records`
WHERE trim(`notes`) != ''
  AND NOT EXISTS (
    SELECT 1 FROM `sales_record_activities`
    WHERE `sales_record_id` = `sales_records`.`id` AND `content` = `sales_records`.`notes`
  );--> statement-breakpoint
INSERT OR IGNORE INTO `team_members` (`name`, `email`, `role`, `is_active`, `created_at`)
VALUES ('Sohair', 'sohair@rosettalanguages.org', 'Administrator', 1, '2026-08-04T00:00:00.000Z');--> statement-breakpoint
INSERT OR IGNORE INTO `team_members` (`name`, `email`, `role`, `is_active`, `created_at`)
VALUES ('Danyal Najmi', 'danyal@rosettalanguages.org', 'Founder & CEO', 1, '2026-08-04T00:00:00.000Z');--> statement-breakpoint
INSERT OR IGNORE INTO `team_members` (`name`, `email`, `role`, `is_active`, `created_at`)
VALUES ('Cyncia Chalmers', 'cyncia@rosettalanguages.org', 'Administrator', 1, '2026-08-04T00:00:00.000Z');
