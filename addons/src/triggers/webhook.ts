import type { TriggerSource } from "@aukjs/core";
import { type Auk, type Static, type TSchema, Value } from "@aukjs/core";

export interface WebhookTriggerOptions {
  hostname?: string;
  port?: number;
  path?: string;
}

export function fromWebhook<S extends TSchema>(
  // biome-ignore lint/suspicious/noExplicitAny: <We don't really care about the type here as the events are passed in>
  auk: Auk<any>,
  schema: S,
  options: WebhookTriggerOptions = {}
): TriggerSource<Static<S>> {
  const { hostname = "localhost", port = 4000, path = "/webhook" } = options;

  return {
    subscribe: (listener) => {
      if (!auk.webhook) {
        const routes = new Map<string, (req: Request) => Promise<Response>>();
        const server = Bun.serve({
          hostname,
          port,
          fetch: async (req) => {
            const url = new URL(req.url);
            const route = routes.get(url.pathname);
            return route
              ? route(req)
              : new Response("Not Found", { status: 404 });
          },
        });

        auk.webhook = { server, routes };
        auk.context.logger.info(
          `Webhook server listening on http://${hostname}:${port}`
        );

        auk.context.addCleanupHandler("webhook-server", () => {
          server.stop();
          auk.context.logger.info("Webhook server stopped");
        });
      }

      auk.webhook.routes.set(path, async (req: Request) => {
        if (req.method !== "POST") {
          return new Response("Method Not Allowed", { status: 405 });
        }

        try {
          const payload: unknown = await req.json();
          if (!Value.Check(schema, payload)) {
            const errors = [...Value.Errors(schema, payload)];
            auk.context.logger.error("Invalid webhook payload:", { errors });
            return new Response("Invalid payload", { status: 400 });
          }

          await listener(payload);

          return new Response(JSON.stringify({ received: true }), {
            headers: { "Content-Type": "application/json" },
          });
        } catch (error) {
          auk.context.logger.error("Error processing webhook:", error);
          return new Response("Internal Server Error", { status: 500 });
        }
      });

      auk.context.logger.info(`Registered webhook on ${path}`);
    },
  };
}
