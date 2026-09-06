CREATE TABLE `app_field_options` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`list_key` text NOT NULL,
	`option_value` text NOT NULL,
	`option_label` text NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`is_active` integer DEFAULT true NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_app_field_options_list_value` ON `app_field_options` (`list_key`,`option_value`);--> statement-breakpoint
CREATE INDEX `idx_app_field_options_list_sort` ON `app_field_options` (`list_key`,`sort_order`);--> statement-breakpoint
CREATE TABLE `app_settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL,
	`updated_at` text NOT NULL
);
