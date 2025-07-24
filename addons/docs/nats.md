# NATS JetStream Integration

Auk Addons provides a NATS JetStream broker for distributed event delivery with DLQ support.

**Note:** When I was building this, I wasn't yet sure of the best way to handle DLQ, so I just went with the simplest solution at the time.
In hindsight, I think it should be a middleware instead of being part of the main auk instance.
Expect this to change in the future.


## Configuration Options

```ts
import { NatsBroker } from "@aukjs/addons";

const broker = new NatsBroker({
  servers: ["nats://localhost:4222"],
  dlq: {
    enabled: true,
    maxDeliver: 5,
    streamSuffix: ".DLQ",
    consumerName: "auk-dlq-consumer",
    autoCreateStreams: true
  },
  autoRegisterStreams: true
});
```

- `servers`: Array of NATS server URLs
- `dlq`: Dead Letter Queue config (see above)
- `autoRegisterStreams`: Auto-create streams for events

## Mini Producer Example

```ts
import { Auk, T } from "@aukjs/core";
import { NatsBroker } from "@aukjs/addons";

const Events = { "user.created": T.Object({ id: T.String() }) };
const auk = new Auk(Events, { broker });

auk.producer("user.created").from(cron("* * * * * *")).handle(async (ctx) => {
  await ctx.emit("user.created", { id: "123" });
});
```