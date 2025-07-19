# Typed Events in Auk

Auk supports TypeScript type safety for events using [TypeBox](https://github.com/sinclairzx81/typebox) schemas. This ensures plugins and modules communicate with correct data types.

---

## Defining Event Schemas

Use TypeBox to define event data schemas:

```typescript
import { Type } from "auk";

const UserCreatedSchema = Type.Object({
  id: Type.String(),
  name: Type.String(),
  email: Type.String(),
});
```

---

## Registering Typed Events

Register event schemas with Auk for type safety:

```typescript
const app = new Auk().event("user.created", UserCreatedSchema);
```

You can chain multiple events:

```typescript
const app = new Auk()
  .event("user.created", UserCreatedSchema)
  .event("order.processed", OrderProcessedSchema);
```

---

## Type-Safe Plugins and Modules

When you use typed events, plugins and modules get type-checked data:

```typescript
app.plugins({
  name: "user-plugin",
  fn: async (context, bus) => {
    bus.emitSync({
      event: "user.created",
      data: {
        id: "user123",
        name: "Alice Johnson",
        email: "alice@example.com",
      },
    });
  },
});

app.modules({
  name: "user-module",
  fn: (bus, context) => {
    bus.on("user.created", (userData) => {
      // userData is typed as { id: string; name: string; email: string; }
      context.logger.info(`New user: ${userData.name} (${userData.email})`);
    });
  },
});
```

---

## Fallback for Untyped Events

Events without schemas default to `any` type for maximum flexibility:

```typescript
app.modules({
  name: "analytics-module",
  fn: (bus, context) => {
    bus.on("unknown.event", (data) => {
      // data is 'any' type
      context.logger.info("Unknown event:", data);
    });
  },
});
```

---

For more, see the [API Reference](./api.md) and [Usage Guide](../USAGE.md).
