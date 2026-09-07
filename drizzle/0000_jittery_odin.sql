CREATE TABLE `stories` (
	`id` integer PRIMARY KEY NOT NULL,
	`story_key` text NOT NULL,
	`data` text NOT NULL,
	`updated_at` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `stories_story_key_unique` ON `stories` (`story_key`);