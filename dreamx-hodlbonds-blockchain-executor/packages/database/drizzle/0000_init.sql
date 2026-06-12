CREATE TYPE "public"."executor_region" AS ENUM('EU1', 'US1');--> statement-breakpoint
CREATE TYPE "public"."log_type" AS ENUM('INSERTED', 'UPDATED', 'DELETED');--> statement-breakpoint
CREATE TYPE "public"."status" AS ENUM('QUEUED', 'EXECUTED', 'EXECUTING', 'EXCEPTION', 'ERROR_RETRY', 'ERROR_NO_RETRY');--> statement-breakpoint
CREATE TABLE "contracts" (
	"id" serial NOT NULL,
	"network" char(3) NOT NULL,
	"contract_name" varchar NOT NULL,
	"address" char(42) NOT NULL,
	"abi" jsonb NOT NULL,
	"last_updated" timestamp,
	CONSTRAINT "contracts_network_contract_name_pk" PRIMARY KEY("network","contract_name")
);
--> statement-breakpoint
CREATE TABLE "queue" (
	"id" serial NOT NULL,
	"status" "status" NOT NULL,
	"priority" smallint NOT NULL,
	"earliest_try" timestamp,
	"latest_try" timestamp,
	"should_retry" boolean NOT NULL,
	"network" varchar(3) NOT NULL,
	"executor" varchar NOT NULL,
	"data" jsonb,
	"task_hash" char(40) NOT NULL,
	"status_message" varchar,
	"tx_hashes" char(66)[],
	"attempts" integer DEFAULT 0,
	"next_attempt" timestamp,
	"previous_attempt_region" "executor_region",
	"gas_price" numeric,
	"gas_usage" bigint,
	CONSTRAINT "queue_id_pk" PRIMARY KEY("id")
);
--> statement-breakpoint
CREATE TABLE "queue_log" (
	"log_id" serial NOT NULL,
	"event_type" "log_type",
	"event_time" timestamp,
	"queue_id" integer NOT NULL,
	"old_row" jsonb,
	"new_row" jsonb,
	CONSTRAINT "queue_log_log_id_pk" PRIMARY KEY("log_id")
);
--> statement-breakpoint
CREATE INDEX "ix_queue_network_status_priority_earliest_try" ON "queue" USING btree ("network","status","priority","earliest_try");--> statement-breakpoint
CREATE UNIQUE INDEX "ix_queue_task_hash_unique" ON "queue" USING btree ("task_hash");--> statement-breakpoint
CREATE INDEX "ix_queue_log_queue_id" ON "queue_log" USING btree ("queue_id");