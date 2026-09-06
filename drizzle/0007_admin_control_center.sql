CREATE TABLE `app_field_definitions` (
	`entity` text NOT NULL,
	`field_key` text NOT NULL,
	`label` text NOT NULL,
	`help_text` text DEFAULT '' NOT NULL,
	`input_type` text NOT NULL,
	`is_required` integer DEFAULT false NOT NULL,
	`is_active` integer DEFAULT true NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`section_key` text NOT NULL,
	`list_key` text,
	`storage_column` text NOT NULL,
	`show_on_contributor` integer DEFAULT false NOT NULL,
	`type_locked` integer DEFAULT false NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_app_field_definitions_entity_key` ON `app_field_definitions` (`entity`,`field_key`);--> statement-breakpoint
CREATE INDEX `idx_app_field_definitions_entity_sort` ON `app_field_definitions` (`entity`,`sort_order`);--> statement-breakpoint
CREATE TABLE `app_view_columns` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`view_key` text NOT NULL,
	`column_key` text NOT NULL,
	`label` text NOT NULL,
	`is_visible` integer DEFAULT true NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`is_locked` integer DEFAULT false NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_app_view_columns_view_column` ON `app_view_columns` (`view_key`,`column_key`);--> statement-breakpoint
CREATE INDEX `idx_app_view_columns_view_sort` ON `app_view_columns` (`view_key`,`sort_order`);