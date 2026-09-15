CREATE TABLE `files` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`score_id` text NOT NULL,
	`object_key` text NOT NULL,
	`name` text NOT NULL,
	`type` text NOT NULL,
	`size` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_files_owner_score` ON `files` (`owner`,`score_id`);--> statement-breakpoint
CREATE TABLE `fingerings` (
	`id` text NOT NULL,
	`owner` text NOT NULL,
	`body` text NOT NULL,
	PRIMARY KEY(`owner`, `id`)
);
--> statement-breakpoint
CREATE TABLE `scores` (
	`id` text NOT NULL,
	`owner` text NOT NULL,
	`body` text NOT NULL,
	`updated_at` integer NOT NULL,
	PRIMARY KEY(`owner`, `id`)
);
