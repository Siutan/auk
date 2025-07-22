# Auk Library - Usage Instructions

## 🎯 Recommended Architecture: Global Event Map Pattern (NEW)

**Auk now uses a global, augmentable event map and schema registry for type-safe, ergonomic event-driven development.**

### Why Use the Global Event Map?

- **Modular**: Each feature can define its own events and schemas
- **Type Safe**: Full TypeScript safety across all files and packages
- **Ergonomic**: Producers/consumers infer types automatically
- **Composable**: No need to chain or assign .event() calls
- **Maintainable**: Clear, central event registry and DX helpers

### Quick Example

```typescript
import { Auk, Type } from "auk";
import { defineEvent, createProducer, createConsumer } from "auk/events";

// Augment the global AukEvents interface
import type { TSchema } from "@sinclair/typebox";
declare module "auk/events" {
  interface AukEvents {
    "user.created": typeof UserCreatedSchema;
    "order.processed": typeof OrderProcessedSchema;
  }
}

// Define and register event schemas
defineEvent(
  "user.created",
  Type.Object({
    id: Type.String(),
    name: Type.String(),
    email: Type.String(),
  })
);
defineEvent(
  "order.processed",
  Type.Object({
    orderId: Type.Number(),
    userId: Type.String(),
    amount: Type.Number(),
  })
);

// Producer/consumer helpers
const userProducer = createProducer("user.created", (payload, ctx) => {
  ctx.logger.info("User created!", payload);
});
const orderConsumer = createConsumer("order.processed", (payload, ctx) => {
  ctx.logger.info("Order processed!", payload);
});

const app = new Auk();
app.plugins({
  name: "user-producer-plugin",
  fn: (bus, context) => {
    userProducer.run(
      {
        id: "user123",
        name: "Alice Johnson",
        email: "alice@example.com",
      },
      context
    );
  },
});
app.modules({
  name: "order-consumer-module",
  fn: (bus, context) => {
    bus.on("order.processed", (orderData) => {
      orderConsumer.handle(orderData, context);
    });
  },
});
await app.start();
```

### Webhook Handler Example

```typescript
import { aukWebhookHandler } from "auk/events";

// In your HTTP server:
app.post("/webhook", async (req, res) => {
  const result = await aukWebhookHandler(req);
  res.status(result.status).json(result.body);
});
```

## Key Features Demonstrated

1. **Global Event-Driven Architecture**: Events and schemas are registered globally
2. **Type Safety**: Full TypeScript support with schema-based event typing
3. **Ergonomic Producers/Consumers**: No manual type imports needed
4. **Type-Safe Webhook Ingestion**: Validate and narrow inbound events
5. **Composable and Modular**: No more .event() chaining required

## Typed Events with TypeBox

Auk supports TypeScript type safety for events using TypeBox schemas. Register events globally and augment the `AukEvents` interface for type inference everywhere.

### Global Event Registration Pattern

```typescript
import { defineEvent } from "auk/events";
import { Type } from "auk";

defineEvent(
  "user.created",
  Type.Object({
    id: Type.String(),
    name: Type.String(),
    email: Type.String(),
  })
);
```

### Module Augmentation for Type Inference

```typescript
import type { TSchema } from "@sinclair/typebox";
declare module "auk/events" {
  interface AukEvents {
    "user.created": typeof UserCreatedSchema;
  }
}
```

### Producer/Consumer Helpers

```typescript
import { createProducer, createConsumer } from "auk/events";

const userProducer = createProducer("user.created", (payload, ctx) => {
  // payload is fully typed
});
const userConsumer = createConsumer("user.created", (payload, ctx) => {
  // payload is fully typed
});
```

### Webhook Handler

```typescript
import { aukWebhookHandler } from "auk/events";

// In your HTTP server:
app.post("/webhook", async (req, res) => {
  const result = await aukWebhookHandler(req);
  res.status(result.status).json(result.body);
});
```

## Creating Your Own Plugins and Modules

- Use `createProducer` for type-safe event emission
- Use `createConsumer` for type-safe event handling
- Register events and schemas globally with `defineEvent`
- Augment `AukEvents` for type inference

## Environment Variables

- `ENV`: Environment (development, production)
- `LOG_LEVEL`: Logging level
- `QUEUE_CONNECTION_STRING`: Message queue connection
- `DB_CONNECTION_STRING`: Database connection

## Next Steps

1. Replace mock plugins with real queue/webhook connections
2. Add proper database integration
3. Add monitoring and metrics
4. Add graceful shutdown handling
5. Add configuration management
6. Add unit tests for plugins and modules
