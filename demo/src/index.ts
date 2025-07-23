import { umqPlugin } from "../../addons/plugins/umq/index.js";
import { webhookPlugin } from "../../addons/plugins/webhook/index.js";
import { Auk, T } from "../../core/src/index.js";

const Events = {
  "webhook.event": T.Object({
    id: T.String(),
  }),
  "user.creation.started": T.Object({
    id: T.String(),
  }),
  "test.event": T.Object({
    message: T.String(),
  }),
  "test.event.processed": T.Object({
    message: T.String(),
    processed: T.Boolean(),
  }),
} as const;

const auk = new Auk(Events, {
  mode: "distributed",
  config: {
    serviceName: "my-app",
    env: "development",
  },
});

auk.plugins(
  webhookPlugin({
    eventName: "webhook.event",
  }),
  webhookPlugin({
    eventName: "user.creation.started",
  }),
  umqPlugin({
    provider: "rabbitmq",
    config: {
      url: "amqp://localhost",
    },
    events: ["test.event", "test.event.processed"],
    schemas: Events,
  })
);

auk.consumer("webhook.event", (data, ctx) => {
  ctx.logger.info("Received webhook event:", data);
});

auk.consumer("user.creation.started", (data, ctx) => {
  ctx.logger.info("Received user creation event:", data);
});

auk.consumer("test.event", (data, ctx) => {
  ctx.logger.info("Received test event:", data);
  auk.umq.emit("test.event.processed", {
    message: data.message,
    processed: true,
  });
});

auk.consumer("test.event.processed", (data, ctx) => {
  ctx.logger.info("Received processed test event:", data);
});

await auk.start();
