-- Unlink extra follow-ups for the same sales record so a unique index can apply.
-- Care rows are kept; only the duplicate link is cleared.
UPDATE `client_follow_ups`
SET `sales_record_id` = NULL, `updated_at` = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
WHERE `sales_record_id` IS NOT NULL
  AND `id` NOT IN (
    SELECT `min_id` FROM (
      SELECT MIN(`id`) AS `min_id`
      FROM `client_follow_ups`
      WHERE `sales_record_id` IS NOT NULL
      GROUP BY `sales_record_id`
    )
  );--> statement-breakpoint
CREATE UNIQUE INDEX `idx_client_follow_ups_sales_record_id` ON `client_follow_ups` (`sales_record_id`);--> statement-breakpoint
-- Backfill Client Care for existing Won sales records that are not yet linked.
INSERT INTO `client_follow_ups` (
  `sales_record_id`, `client_name`, `relationship_type`, `last_engagement_at`, `last_check_in_at`,
  `satisfaction_status`, `next_follow_up_at`, `next_action`, `expansion_opportunity`, `created_at`, `updated_at`
)
SELECT
  `sales_records`.`id`,
  `sales_records`.`lead_name`,
  CASE `sales_records`.`opportunity_type`
    WHEN 'One-time project' THEN 'One-time client'
    WHEN 'Ongoing vendor relationship' THEN 'Ongoing vendor relationship'
    ELSE 'Recurring client'
  END,
  COALESCE(`sales_records`.`closed_at`, `sales_records`.`created_at`),
  NULL,
  'Healthy',
  NULL,
  'Client check-in',
  '',
  strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
  strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
FROM `sales_records`
WHERE `sales_records`.`stage` = 'Won'
  AND NOT EXISTS (
    SELECT 1 FROM `client_follow_ups`
    WHERE `client_follow_ups`.`sales_record_id` = `sales_records`.`id`
  );
