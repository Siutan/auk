# Creating Modules in Auk

Modules encapsulate business logic and subscribe to events from the Auk event bus.

---

## Module Signature

A module is a function (or named object) with the following signature:

```typescript
type AukModule = (bus: AukBus, context: AukContext) => void;
```

- `bus`: The event bus for subscribing to events.
- `context`: Shared context (logger, config, etc).

---

## Module Example

```typescript
import { AukModule } from "auk";

export const myModule: AukModule = (bus, context) => {
  bus.on("my.event", async (data) => {
    context.logger.info(`Processing event ${data.id} at ${data.timestamp}`);
    // Business logic here
    bus.emit({
      event: "my.processed",
      data: { originalId: data.id, result: "success" },
    });
  });
};
```

---

## Best Practices

- Use type-safe event schemas for better reliability.
- Handle errors gracefully; avoid crashing the process.
- Use the shared context for logging, config, etc.

For more, see the [API Reference](./api.md) and [Usage Guide](../USAGE.md).
