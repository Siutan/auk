# Creating Plugins in Auk

Plugins are responsible for connecting to event sources (queues, cron, webhooks, etc.) and emitting events into the Auk event bus.

---

## Plugin Signature

A plugin is a function (or named object) with the following signature:

```typescript
type AukPlugin = (context: AukContext, bus: AukBus) => Promise<void> | void;
```

- `context`: Shared context (logger, config, etc).
- `bus`: The event bus for emitting events.

---

## Typed Plugin Example

```typescript
import { AukPlugin, Type } from "auk";

const MyEventSchema = Type.Object({
  id: Type.String(),
  timestamp: Type.Number(),
  data: Type.String(),
});

export const myPlugin: AukPlugin = async (context, bus) => {
  context.logger.info("My plugin starting...");
  bus.emit({
    event: "my.event",
    data: {
      id: "evt123",
      timestamp: Date.now(),
      data: "example",
    },
  });
};

// then register on the instance
app.events("my.event", MyEventSchema);

app.plugins(myPlugin);
```

---

## Untyped Plugin Example (Legacy)

```typescript
import { AukPlugin } from "auk";

export const myPlugin: AukPlugin = async (context, bus) => {
  context.logger.info("My plugin starting...");
  bus.emit({ event: "my.event", data: { anything: "goes" } });
};

// then register on the instance
app.plugins(myPlugin);
```

---

## Best Practices

- Use descriptive event names (e.g., `user.created`, `job.completed`).
- Keep plugins stateless and external-connection aware.
- Support graceful shutdown if possible (register cleanup handlers).
- Use TypeBox schemas for type safety.

For more, see the [API Reference](./api.md) and [Usage Guide](../USAGE.md).
