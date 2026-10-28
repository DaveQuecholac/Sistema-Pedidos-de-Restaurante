CREATE TABLE "order_outbox" (
	"id" text PRIMARY KEY NOT NULL,
	"event_type" text NOT NULL,
	"order_id" text NOT NULL,
	"status" text NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"published_at" timestamp with time zone,
	CONSTRAINT "order_outbox_order_id_event_type" UNIQUE("order_id","event_type"),
	CONSTRAINT "order_outbox_event_type" CHECK ("order_outbox"."event_type" = 'OrderSentToKitchen'),
	CONSTRAINT "order_outbox_status" CHECK ("order_outbox"."status" = 'SENT_TO_KITCHEN')
);
