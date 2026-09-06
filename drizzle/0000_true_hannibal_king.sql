CREATE TABLE `sales_records` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`lead_name` text NOT NULL,
	`company` text DEFAULT '' NOT NULL,
	`source` text NOT NULL,
	`owner` text NOT NULL,
	`service` text NOT NULL,
	`stage` text NOT NULL,
	`estimated_revenue_cents` integer DEFAULT 0 NOT NULL,
	`booked_revenue_cents` integer DEFAULT 0 NOT NULL,
	`created_at` text NOT NULL,
	`closed_at` text,
	`notes` text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_sales_records_created_at` ON `sales_records` (`created_at`);--> statement-breakpoint
CREATE INDEX `idx_sales_records_owner_created_at` ON `sales_records` (`owner`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_sales_records_stage` ON `sales_records` (`stage`);