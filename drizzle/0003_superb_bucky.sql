CREATE TABLE `access_invitations` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`email` text NOT NULL,
	`display_name` text NOT NULL,
	`role` text NOT NULL,
	`token_hash` text NOT NULL,
	`expires_at` text NOT NULL,
	`accepted_at` text,
	`revoked_at` text,
	`sent_at` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `access_invitations_email_unique` ON `access_invitations` (`email`);--> statement-breakpoint
CREATE INDEX `idx_access_invitations_expires_at` ON `access_invitations` (`expires_at`);--> statement-breakpoint
CREATE INDEX `idx_access_invitations_active` ON `access_invitations` (`revoked_at`,`accepted_at`);--> statement-breakpoint
CREATE TABLE `app_users` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`email` text NOT NULL,
	`display_name` text NOT NULL,
	`role` text NOT NULL,
	`is_active` integer DEFAULT true NOT NULL,
	`created_at` text NOT NULL,
	`last_login_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `app_users_email_unique` ON `app_users` (`email`);--> statement-breakpoint
CREATE INDEX `idx_app_users_active` ON `app_users` (`is_active`);--> statement-breakpoint
CREATE INDEX `idx_app_users_role` ON `app_users` (`role`);