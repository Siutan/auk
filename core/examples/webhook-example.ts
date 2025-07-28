import { fromWebhook } from "../../addons/src/triggers/webhook.js";
import { Auk, T } from "../src/index.js";

// 1. Define the webhook event schema
const WebhookPayloadSchema = T.Object({
  event: T.String(),
  payload: T.Any(),
  headers: T.Record(T.String(), T.String()),
  url: T.String(),
});

const Events = {
  "webhook.received": WebhookPayloadSchema,
} as const;

// 2. Create Auk instance
const auk = new Auk(Events, {
  config: { env: "development" },
});

// 3. Register producer with webhook trigger
auk
  .producer("webhook.received")
  .from(fromWebhook(auk, WebhookPayloadSchema, { path: "/webhook" }))
  .handle(async ({ payload, emit }) => {
    emit("webhook.received", payload);
  });

auk.consumer("webhook.received", (data, ctx) => {
  ctx.logger.info("Received webhook:", data.event, data.payload);
});

// 4. Start the service
console.log("Starting Auk service with webhook plugin...");
auk.start();
