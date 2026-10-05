ALTER TABLE `flows` ADD `card_id` integer REFERENCES `cards`(`id`) ON DELETE set null CONSTRAINT "flows_card_check" CHECK("kind" = 'payment' or "card_id" is null);
