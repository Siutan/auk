# Auk Library - Usage Instructions

## Quick Start

### 1. Test the Library

```bash
cd auk
bun test.ts
```

This will run a simple test to verify the library is working correctly.

### 2. Run the Demo

```bash
cd auk
bun demo.ts
```

This will start the demo consumer service with multiple plugins and modules. You'll see:

- Azure Service Bus simulation events
- LTI upload processing
- Notification handling
- Health checks and maintenance tasks

### 3. Run the LTI Consumer Service

```bash
cd consumer-service
bun index.ts
```

This starts a production-ready LTI consumer service that demonstrates real-world usage.

## Project Structure

```
auk/
├── index.ts              # Main Auk library
├── demo.ts               # Demo application
├── test.ts               # Simple test
├── USAGE.md              # This file
├── plugins/              # Event source handlers
│   ├── azure-service-bus.ts
│   └── cron.ts
└── modules/              # Business logic handlers
    ├── lti-upload.ts
    ├── notification.ts
    └── maintenance.ts

consumer-service/
└── index.ts              # Production LTI consumer service
```

## Key Features Demonstrated

1. **Event-Driven Architecture**: Plugins emit events, modules subscribe and process
2. **Modular Design**: Easy to add new plugins and modules
3. **Shared Context**: Logger, database, and config available to all components
4. **Error Handling**: Graceful error handling with proper logging
5. **Inter-Module Communication**: Modules can communicate via the event bus
6. **BunJS Native**: Leverages Bun's performance and ESM support
7. **Type Safety**: Full TypeScript support with schema-based event typing

## Typed Events with TypeBox

Auk supports TypeScript type safety for events using TypeBox schemas (like Elysia). This ensures plugins and modules communicate with correct data types.

### Basic Typed Event Usage

```typescript
import { Auk, Type } from "./src";

// Define event schemas
const UserCreatedSchema = Type.Object({
  id: Type.String(),
  name: Type.String(),
  email: Type.String(),
});

// Create typed app
const app = new Auk().event("user.created", UserCreatedSchema);

// Plugin with type-safe emission
app.plugins({
  name: "user-plugin",
  fn: async (context, bus) => {
    // TypeScript enforces correct data structure
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

// Module with type-safe listening
app.modules({
  name: "user-module",
  fn: (bus, context) => {
    // userData is automatically typed as { id: string; name: string; email: string; }
    bus.on("user.created", (userData) => {
      context.logger.info(`New user: ${userData.name} (${userData.email})`);
    });
  },
});
```

### Multiple Event Types

```typescript
const app = new Auk()
  .event(
    "user.created",
    Type.Object({
      id: Type.String(),
      name: Type.String(),
      email: Type.String(),
    })
  )
  .event(
    "order.processed",
    Type.Object({
      orderId: Type.Number(),
      userId: Type.String(),
      amount: Type.Number(),
    })
  )
  .event(
    "notification.sent",
    Type.Object({
      recipient: Type.String(),
      message: Type.String(),
      channel: Type.Union([Type.Literal("email"), Type.Literal("sms")]),
    })
  );
```

### Fallback for Untyped Events

Events without schemas default to `any` type for maximum flexibility:

```typescript
app.modules({
  name: "analytics-module",
  fn: (bus, context) => {
    // data is 'any' type for unknown events
    bus.on("unknown.event", (data) => {
      context.logger.info("Unknown event:", data);
    });
  },
});
```

## Creating Your Own Plugins

### Typed Plugin

```typescript
import { AukPlugin, Type } from "./src";

// First define your event schema
const MyEventSchema = Type.Object({
  id: Type.String(),
  timestamp: Type.Number(),
  data: Type.String(),
});

// Create typed plugin
export const myPlugin: AukPlugin = async (context, bus) => {
  context.logger.info("My plugin starting...");

  // TypeScript will enforce the schema
  bus.emit({
    event: "my.event",
    data: {
      id: "evt123",
      timestamp: Date.now(),
      data: "example",
    },
  });
};
```

### Untyped Plugin (Legacy)

```typescript
import { AukPlugin } from "./src";

export const myPlugin: AukPlugin = async (context, bus) => {
  context.logger.info("My plugin starting...");

  // No type enforcement
  bus.emit({ event: "my.event", data: { anything: "goes" } });
};
```

## Creating Your Own Modules

### Typed Module

```typescript
import { AukModule } from "./src";

export const myModule: AukModule = (bus, context) => {
  // data parameter is automatically typed based on event schema
  bus.on("my.event", async (data) => {
    // data is typed as { id: string; timestamp: number; data: string; }
    context.logger.info(`Processing event ${data.id} at ${data.timestamp}`);

    // Business logic here
    // Can emit other typed events
    bus.emit({
      event: "my.processed",
      data: { originalId: data.id, result: "success" },
    });
  });
};
```

### Untyped Module (Legacy)

```typescript
import { AukModule } from "./src";

export const myModule: AukModule = (bus, context) => {
  bus.on("my.event", async (data) => {
    // data is 'any' type
    context.logger.info("Processing my event:", data);
  });
};
```

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
