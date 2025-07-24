# RabbitMQ Integration

Auk Addons provides a RabbitMQ provider for topic-based distributed messaging.

## Configuration Options

```ts
import { RabbitMQProvider } from "@aukjs/addons";

const provider = new RabbitMQProvider({
  url: "amqp://localhost:5672",
  exchange: "auk_events", // optional
  queue: "auk_queue" // optional
});
```

- `url`: RabbitMQ connection URL
- `exchange`: Exchange name (default: "auk_events")
- `queue`: Queue name (default: auto-generated)

## Mini Producer Example

```ts
import { Auk, T } from "@aukjs/core";
import { umqTrigger } from "@aukjs/addons";

const Events = { "file.uploaded": T.Object({ name: T.String() }) };
const auk = new Auk(Events);

auk.producer("file.uploaded")
  .from(umqTrigger(auk, { provider: "rabbitmq", config: { url: "amqp://localhost:5672" } })
  .handle(async (ctx) => {
    await ctx.emit("file.uploaded", { name: "report.pdf" });
  });
```