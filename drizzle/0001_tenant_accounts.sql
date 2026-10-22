ALTER TABLE `stories` RENAME TO `stories_legacy`;
--> statement-breakpoint
CREATE TABLE `stories` (`id` integer PRIMARY KEY NOT NULL,`owner_id` text NOT NULL,`story_key` text NOT NULL,`data` text NOT NULL,`updated_at` integer DEFAULT 0 NOT NULL,UNIQUE(`owner_id`,`story_key`));
--> statement-breakpoint
INSERT INTO `stories` (`id`,`owner_id`,`story_key`,`data`,`updated_at`) SELECT `id`,'__legacy__',`story_key`,`data`,`updated_at` FROM `stories_legacy`;
--> statement-breakpoint
DROP TABLE `stories_legacy`;
--> statement-breakpoint
CREATE INDEX `stories_owner_id_idx` ON `stories` (`owner_id`);
--> statement-breakpoint
CREATE TABLE `users` (`id` text PRIMARY KEY NOT NULL,`email` text NOT NULL UNIQUE,`name` text NOT NULL,`role` text NOT NULL,`password_salt` text NOT NULL,`password_hash` text NOT NULL,`subscription_status` text NOT NULL,`subscription_ends_at` integer,`created_at` integer NOT NULL,`updated_at` integer NOT NULL);
--> statement-breakpoint
CREATE TABLE `sessions` (`token_hash` text PRIMARY KEY NOT NULL,`user_id` text NOT NULL,`expires_at` integer NOT NULL,`created_at` integer NOT NULL);
--> statement-breakpoint
CREATE INDEX `sessions_user_id_idx` ON `sessions` (`user_id`);
--> statement-breakpoint
CREATE TABLE `channel_profiles` (`user_id` text PRIMARY KEY NOT NULL,`channel_name` text NOT NULL DEFAULT '',`channel_topic` text NOT NULL DEFAULT '',`target_audience` text NOT NULL DEFAULT '',`content_language` text NOT NULL DEFAULT 'English',`content_tone` text NOT NULL DEFAULT 'Educational and engaging',`upload_privacy` text NOT NULL DEFAULT 'private',`posting_schedule` text NOT NULL DEFAULT '3 videos per week',`youtube_channel_id` text NOT NULL DEFAULT '',`youtube_refresh_token` text,`updated_at` integer NOT NULL DEFAULT 0);
