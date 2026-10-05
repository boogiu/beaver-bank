CREATE TABLE `cards` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`issuer` text NOT NULL,
	`type` text NOT NULL,
	`account_id` integer,
	`payment_day` integer,
	`number_tail` text,
	`is_active` integer DEFAULT true NOT NULL,
	`memo` text,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "cards_type_check" CHECK("cards"."type" in ('debit', 'credit')),
	CONSTRAINT "cards_payment_day_check" CHECK(("cards"."type" = 'debit' and "cards"."payment_day" is null) or ("cards"."type" = 'credit' and typeof("cards"."payment_day") = 'integer' and "cards"."payment_day" between 1 and 31))
);
