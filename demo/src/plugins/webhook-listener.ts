import { Type, plugin } from "../../../core/src";

// 1. Define the webhook event schema
export const WebhookEventSchema = Type.Object({
  event: Type.String(),
  payload: Type.Any(), // Accepts any JSON body, can restrict if needed
  headers: Type.Record(Type.String(), Type.String()),
  url: Type.String(),
});

// 2. Export the plugin (with events)
export const webhookPlugin = plugin({
  name: "webhook-plugin",
  fn: async (bus, context) => {
    const port = Number(process.env.WEBHOOK_PORT || 4000);
    const path = process.env.WEBHOOK_PATH || "/webhook";

    // Start Bun HTTP server
    const server = Bun.serve({
      port,
      async fetch(req) {
        if (req.method === "POST" && new URL(req.url).pathname === path) {
          try {
            const payload =
              (await req.json()) as typeof WebhookEventSchema.static;
            context.logger.debug("received Req with event", payload.event);
            // Emit the webhook event
            await bus.emit({
              event: payload.event,
              data: {
                payload,
                headers: Object.fromEntries(req.headers),
                url: req.url,
              },
            });
            return new Response("ok", { status: 200 });
          } catch (err) {
            context.logger.error("Webhook error:", err);
            return new Response("Invalid payload", { status: 400 });
          }
        }
        return new Response("Not found", { status: 404 });
      },
    });

    context.logger.info(
      `🚦 Webhook server running on http://localhost:${port}${path}`
    );

    // Cleanup on shutdown
    context.addCleanupHandler("webhook-server", () => {
      server.stop();
      context.logger.info("Webhook server stopped");
    });
  },
});
