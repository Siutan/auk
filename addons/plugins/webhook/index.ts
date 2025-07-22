import type { PluginFn } from "../../../core/src";
import { T, Value } from "../../../core/src";

// 1. Define the webhook event schema
export const WebhookEventSchema = T.Object({
  event: T.String(),
  payload: T.Any(), // Accepts any JSON body, can restrict if needed
  headers: T.Record(T.String(), T.String()),
  url: T.String(),
});

// 2. Define the webhook plugin
export interface WebhookPluginOptions {
  eventName: string;
  hostname?: string;
  port?: number;
  path?: string;
}

export const webhookPlugin = ({
  eventName,
  hostname = "localhost",
  port = 4000,
  path = "/webhook",
}: WebhookPluginOptions): PluginFn<any> => {
  return (auk, ctx, bus) => {
    if (!auk.webhook) {
      const routes = new Map<string, any>();
      const server = Bun.serve({
        hostname,
        port,
        fetch: async (req) => {
          const url = new URL(req.url);
          const route = routes.get(url.pathname);

          if (route) {
            return route(req);
          }

          return new Response("Not Found", { status: 404 });
        },
      });

      auk.webhook = { server, routes };

      ctx.logger.info(`Webhook server listening on http://${hostname}:${port}`);

      ctx.addCleanupHandler("webhook-server", () => {
        server.stop();
        ctx.logger.info("Webhook server stopped");
      });
    }

    auk.webhook.routes.set(path, async (req: Request) => {
      if (req.method !== "POST") {
        return new Response("Method Not Allowed", { status: 405 });
      }

      try {
        const payload: any = await req.json();
        const isValid = Value.Check(WebhookEventSchema, payload);

        if (!isValid) {
          const errors = [...Value.Errors(WebhookEventSchema, payload)];
          ctx.logger.error("Invalid webhook payload:", errors);
          return new Response("Invalid payload", { status: 400 });
        }

        bus.emit({ event: eventName, data: { id: payload.payload.id } });

        return new Response(JSON.stringify({ received: true }), {
          headers: { "Content-Type": "application/json" },
        });
      } catch (error) {
        ctx.logger.error("Error processing webhook:", error);
        return new Response("Internal Server Error", { status: 500 });
      }
    });

    ctx.logger.info(`Registered webhook for ${eventName} on ${path}`);
  };
};
