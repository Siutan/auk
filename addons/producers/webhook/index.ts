import type { ProducerFn } from "../../../core/src";
import { Type } from "../../../core/src";

// 1. Define the webhook event schema
export const WebhookEventSchema = Type.Object({
  event: Type.String(),
  payload: Type.Any(), // Accepts any JSON body, can restrict if needed
  headers: Type.Record(Type.String(), Type.String()),
  url: Type.String(),
});

// 2. Define the webhook producer
export const webhookProducer: ProducerFn<
  "webhook",
  { webhook: typeof WebhookEventSchema }
> = (event, { handler }) => {
  const port = Number(process.env.WEBHOOK_PORT || 4000);
  const path = process.env.WEBHOOK_PATH || "/webhook";

  // Start Bun HTTP server
  const server = Bun.serve({
    port,
    async fetch(req) {
      if (req.method === "POST" && new URL(req.url).pathname === path) {
        try {
          const payload: any = await req.json();
          handler({
            payload: {
              event: payload.event,
              payload,
              headers: Object.fromEntries(req.headers),
              url: req.url,
            },
            ctx: {} as any, // These are injected by Auk
            emit: (() => {}) as any,
          });
          return new Response("ok", { status: 200 });
        } catch (err) {
          console.error("Webhook error:", err);
          return new Response("Invalid payload", { status: 400 });
        }
      }
      return new Response("Not found", { status: 404 });
    },
  });

  console.info(`🚦 Webhook server running on http://localhost:${port}${path}`);

  // Cleanup on shutdown
  // This part needs to be handled by the Auk instance
};
