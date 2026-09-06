ALTER TABLE `app_users` ADD `password_hash` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `app_users` ADD `must_change_password` integer DEFAULT false NOT NULL;