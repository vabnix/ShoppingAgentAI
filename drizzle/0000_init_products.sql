CREATE TABLE `products` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`price_cents` integer NOT NULL,
	`rating` real,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL
);
