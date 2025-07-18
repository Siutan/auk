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

## Creating Your Own Plugins

```typescript
import { AukPlugin } from "./index";

export const myPlugin: AukPlugin = async (context, bus) => {
  context.logger.info("My plugin starting...");

  // Listen to external events (queue, webhooks, etc.)
  // Then emit events to the bus
  bus.emit("my.event", { data: "example" });
};
```

## Creating Your Own Modules

```typescript
import { AukModule } from "./index";

export const myModule: AukModule = (bus, context) => {
  bus.on("my.event", async (data) => {
    context.logger.info("Processing my event:", data);

    // Business logic here
    // Can emit other events for inter-module communication
    bus.emit("my.processed", { result: "success" });
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
