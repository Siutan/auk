Absolutely! Here’s a refreshed README that reflects your **event bus** identity, highlights the type-safe, modular system, and gives clarity for both Bun and Node.js users.
_I kept it concise, clear, and focused on developer appeal and modern features:_

---

# Auk: Type-Safe Modular Event Bus & Background Job Framework

**Auk** is a lightweight, extensible event bus and background job framework for Bun (and Node.js). Designed for concurrency, type safety, and developer ergonomics, Auk makes it easy to compose, scale, and maintain decoupled services, background jobs, and real-time workflows.

---

## Key Features

- **Type-Safe Event Bus**: Define strict event schemas—never ship an invalid payload again
- **Modular by Design**: Compose scalable apps from plugins and modules
- **Shared Context**: Inject logger, config, and database into every handler
- **Resilient & Robust**: Graceful error handling and lifecycle management
- **Inter-Module Communication**: Modules and plugins communicate via the event bus, not direct calls
- **Bun Native (with Node.js support)**: Built for Bun’s speed and ESM, runs great on Node.js too
- **First-Class TypeScript Support**: Enjoy autocompletion, type inference, and schema validation out of the box

---

## Quick Start

> **Requires [Bun](https://bun.sh/)** (Node.js support coming soon)

1. **Install dependencies:**

   ```bash
   bun install
   ```

2. **Run the tests:**

   ```bash
   bun test.ts
   ```

3. **Run the demo:**

   ```bash
   bun demo.ts
   ```

---

## Usage

See more real-world patterns in the [examples](./examples) folder.

```typescript
import { Auk, Type } from "auk";

// 1. Define your event schemas
const UserCreatedSchema = Type.Object({
  id: Type.String(),
  name: Type.String(),
  email: Type.String(),
});

// 2. Register events and create your app
const app = new Auk().event("user.created", UserCreatedSchema);

// 3. Register plugins (emit events)
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

// 4. Register modules (listen to events)
app.modules({
  name: "user-module",
  fn: (bus, context) => {
    bus.on("user.created", (userData) => {
      context.logger.info(`New user: ${userData.name} (${userData.email})`);
    });
  },
});

// 5. Start your app!
app.start();
```

- **Type Safety**: Invalid event payloads will fail at compile-time—no more guesswork.
- **Flexible**: Omit event types for rapid prototyping, add schemas for full safety.
- **Decoupled**: Plugins/modules don’t know about each other—only about events.
- **Distributed**: Scale across multiple processes/machines with NATS broker support.

---

## Distributed Mode

Auk supports distributed event processing using message brokers. Events can be distributed across multiple application instances with different delivery guarantees.

### Things to know about distributed mode:
- Auk only supports NATS brokers for now
- Wildcards are not supported in distributed mode and will fall back to local processing

```typescript
import { Auk, Type } from "auk";
import { NATS } from "auk/distributed";

const broker = new NATS({ servers: "nats://localhost:4222" });

const app = new Auk({
  mode: "distributed",
  broker,
  config: { serviceName: "worker-service" },
}).event("job.process", Type.Object({ id: Type.String() }));

// Queue delivery: load-balanced across workers
app.plugins({
  name: "job-producer",
  fn: (context, bus) => {
    // Auto-cleanup timers
    context.setInterval(() => {
      bus.emit({ event: "job.process", data: { id: "job-123" } });
    }, 1000);
  },
  delivery: "queue",
});

// Broadcast delivery: received by all instances
app.modules({
  name: "job-worker",
  fn: (bus, context) => {
    bus.on(
      "job.process",
      (data) => {
        context.logger.info(`Processing job: ${data.id}`);

        // Auto-cleanup timeouts
        context.setTimeout(() => {
          context.logger.info(`Job ${data.id} completed`);
        }, 500);
      },
      { delivery: "queue" }
    );
  },
});

app.start();
```

**Delivery Modes:**

- `queue`: Load-balanced across instances (work distribution)
- `broadcast`: Sent to all instances (notifications, state sync)

**Auto-Cleanup Timers:**

Auk provides `context.setInterval()` and `context.setTimeout()` that automatically register cleanup handlers. No need to manually clear timers during shutdown as the library will handle it.

---

## Documentation

- [Usage Guide](./USAGE.md)
- [API Reference](./docs/api.md)
- [Plugins Guide](./docs/plugins.md)
- [Modules Guide](./docs/modules.md)
- [Typed Events](./docs/typed-events.md)

---

## License

MIT

---

### **What is Auk?**

> Auk is a type-safe, modular event bus and background job framework. It lets you decouple your background tasks, listeners, and workflows using modern TypeScript schemas and a plugin/module system.

---
