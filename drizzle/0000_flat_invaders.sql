CREATE TABLE `accounts` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`bank` text NOT NULL,
	`number_tail` text,
	`type` text NOT NULL,
	`purpose_id` integer,
	`is_active` integer DEFAULT true NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`memo` text,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	FOREIGN KEY (`purpose_id`) REFERENCES `purposes`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "accounts_type_check" CHECK("accounts"."type" in ('checking', 'installment', 'deposit', 'parking', 'cma', 'investment'))
);
--> statement-breakpoint
CREATE TABLE `balance_snapshots` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`account_id` integer NOT NULL,
	`date` text NOT NULL,
	`balance` integer NOT NULL,
	`memo` text,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "balance_snapshots_balance_check" CHECK(typeof("balance_snapshots"."balance") = 'integer'),
	CONSTRAINT "balance_snapshots_date_check" CHECK("balance_snapshots"."date" glob '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]' and strftime('%Y-%m-%d', "balance_snapshots"."date", '+0 days') is "balance_snapshots"."date" and "balance_snapshots"."date" > '0000-12-31')
);
--> statement-breakpoint
CREATE UNIQUE INDEX `balance_snapshots_account_date_idx` ON `balance_snapshots` (`account_id`,`date`);--> statement-breakpoint
CREATE TABLE `flow_overrides` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`flow_id` integer NOT NULL,
	`occurrence_date` text NOT NULL,
	`actual_amount` integer,
	`skipped` integer DEFAULT false NOT NULL,
	`memo` text,
	FOREIGN KEY (`flow_id`) REFERENCES `flows`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "flow_overrides_effect_check" CHECK("flow_overrides"."skipped" = 1 or "flow_overrides"."actual_amount" is not null),
	CONSTRAINT "flow_overrides_amount_check" CHECK("flow_overrides"."actual_amount" is null or (typeof("flow_overrides"."actual_amount") = 'integer' and "flow_overrides"."actual_amount" >= 0)),
	CONSTRAINT "flow_overrides_occurrence_date_check" CHECK("flow_overrides"."occurrence_date" glob '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]' and strftime('%Y-%m-%d', "flow_overrides"."occurrence_date", '+0 days') is "flow_overrides"."occurrence_date" and "flow_overrides"."occurrence_date" > '0000-12-31')
);
--> statement-breakpoint
CREATE UNIQUE INDEX `flow_overrides_flow_date_idx` ON `flow_overrides` (`flow_id`,`occurrence_date`);--> statement-breakpoint
CREATE TABLE `flows` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`kind` text NOT NULL,
	`amount` integer NOT NULL,
	`is_variable` integer DEFAULT false NOT NULL,
	`from_account_id` integer,
	`to_account_id` integer,
	`category` text DEFAULT 'other' NOT NULL,
	`cycle` text DEFAULT 'monthly' NOT NULL,
	`day` integer NOT NULL,
	`month` integer,
	`start_date` text NOT NULL,
	`end_date` text,
	`memo` text,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	FOREIGN KEY (`from_account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`to_account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "flows_kind_check" CHECK("flows"."kind" in ('income', 'transfer', 'payment')),
	CONSTRAINT "flows_category_check" CHECK("flows"."category" in ('salary', 'savings', 'allocation', 'subscription', 'insurance', 'telecom', 'utility', 'loan', 'other')),
	CONSTRAINT "flows_cycle_check" CHECK("flows"."cycle" in ('monthly', 'yearly')),
	CONSTRAINT "flows_amount_check" CHECK(typeof("flows"."amount") = 'integer' and "flows"."amount" >= 0),
	CONSTRAINT "flows_day_check" CHECK(typeof("flows"."day") = 'integer' and "flows"."day" between 1 and 31),
	CONSTRAINT "flows_month_check" CHECK(("flows"."cycle" = 'monthly' and "flows"."month" is null) or ("flows"."cycle" = 'yearly' and "flows"."month" is not null and typeof("flows"."month") = 'integer' and "flows"."month" between 1 and 12)),
	CONSTRAINT "flows_accounts_check" CHECK(("flows"."kind" = 'income' and "flows"."from_account_id" is null and "flows"."to_account_id" is not null)
        or ("flows"."kind" = 'transfer' and "flows"."from_account_id" is not null and "flows"."to_account_id" is not null and "flows"."from_account_id" <> "flows"."to_account_id")
        or ("flows"."kind" = 'payment' and "flows"."from_account_id" is not null and "flows"."to_account_id" is null)),
	CONSTRAINT "flows_period_check" CHECK("flows"."end_date" is null or "flows"."end_date" >= "flows"."start_date"),
	CONSTRAINT "flows_start_date_check" CHECK("flows"."start_date" glob '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]' and strftime('%Y-%m-%d', "flows"."start_date", '+0 days') is "flows"."start_date" and "flows"."start_date" > '0000-12-31'),
	CONSTRAINT "flows_end_date_check" CHECK("flows"."end_date" is null or ("flows"."end_date" glob '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]' and strftime('%Y-%m-%d', "flows"."end_date", '+0 days') is "flows"."end_date" and "flows"."end_date" > '0000-12-31'))
);
--> statement-breakpoint
CREATE INDEX `flows_from_account_idx` ON `flows` (`from_account_id`);--> statement-breakpoint
CREATE INDEX `flows_to_account_idx` ON `flows` (`to_account_id`);--> statement-breakpoint
CREATE TABLE `purposes` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`color` text DEFAULT '#8b5e3c' NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `purposes_name_unique` ON `purposes` (`name`);--> statement-breakpoint
CREATE TABLE `savings_details` (
	`account_id` integer PRIMARY KEY NOT NULL,
	`start_date` text NOT NULL,
	`maturity_date` text NOT NULL,
	`interest_rate` real NOT NULL,
	`interest_type` text DEFAULT 'simple' NOT NULL,
	`tax_type` text DEFAULT 'normal' NOT NULL,
	`target_amount` integer,
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "savings_interest_type_check" CHECK("savings_details"."interest_type" in ('simple', 'compound')),
	CONSTRAINT "savings_tax_type_check" CHECK("savings_details"."tax_type" in ('normal', 'tax_free', 'preferential')),
	CONSTRAINT "savings_period_check" CHECK("savings_details"."maturity_date" > "savings_details"."start_date"),
	CONSTRAINT "savings_rate_check" CHECK("savings_details"."interest_rate" >= 0),
	CONSTRAINT "savings_target_amount_check" CHECK("savings_details"."target_amount" is null or (typeof("savings_details"."target_amount") = 'integer' and "savings_details"."target_amount" >= 0)),
	CONSTRAINT "savings_start_date_check" CHECK("savings_details"."start_date" glob '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]' and strftime('%Y-%m-%d', "savings_details"."start_date", '+0 days') is "savings_details"."start_date" and "savings_details"."start_date" > '0000-12-31'),
	CONSTRAINT "savings_maturity_date_check" CHECK("savings_details"."maturity_date" glob '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]' and strftime('%Y-%m-%d', "savings_details"."maturity_date", '+0 days') is "savings_details"."maturity_date" and "savings_details"."maturity_date" > '0000-12-31')
);
