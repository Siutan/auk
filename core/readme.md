Absolutely! Here’s a refreshed README that reflects your **event bus** identity, highlights the type-safe, modular system, and gives clarity for both Bun and Node.js users.
_I kept it concise, clear, and focused on developer appeal and modern features:_

---

# Auk: Type-Safe Event Bus & Background Job Framework

**Auk** is a lightweight, extensible event bus and background job framework for Bun (and Node.js). Designed for type safety, developer ergonomics, and scalability, Auk makes it easy to build decoupled services, background jobs, and real-time workflows with full TypeScript support.

---

## Key Features

- **Type-Safe Event Schemas**: Define strict event schemas with TypeBox—never ship an invalid payload again
- **Fluent Producer API**: Intuitive `.producer(event).from(trigger).handle(handler)` pattern
- **Flexible Triggers**: Built-in support for cron schedules, message queues, and custom triggers
- **Distributed Mode**: Scale across multiple processes with NATS broker support
- **Comprehensive Middleware**: Lifecycle hooks for monitoring, logging, metrics, and error handling
- **Auto-Cleanup**: Automatic resource cleanup with `context.setInterval()` and `context.setTimeout()`
- **Graceful Shutdown**: Built-in signal handling and cleanup management
- **Bun Native**: Built for Bun's speed and ESM, with Node.js compatibility

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
import { Auk, cron, T } from "auk";

// 1. Define event schemas with TypeBox
const Events = {
  "user.created": T.Object({
    id: T.String(),
    name: T.String(),
    email: T.String(),
  }),
  "order.processed": T.Object({
    orderId: T.Number(),
    userId: T.String(),
    amount: T.Number(),
  }),
} as const;

// 2. Create Auk instance with events
const auk = new Auk(Events, {
  config: { env: "development" },
});

// 3. Register a producer using the fluent API
auk
  .producer("order.processed")
  .from(cron("*/5 * * * * *")) // Every 5 seconds
  .handle(({ ctx, emit }) => {
    const mockOrder = {
      orderId: Math.floor(Math.random() * 1000),
      userId: `user-${Math.floor(Math.random() * 100)}`,
      amount: Math.round(Math.random() * 1000 * 100) / 100,
    };

    ctx.logger.info("Processing order", mockOrder);
    
    // Emit events - fully type-safe!
    emit("order.processed", mockOrder);
    
    // Conditionally emit other events
    if (mockOrder.orderId % 3 === 0) {
      emit("user.created", {
        id: mockOrder.userId,
        name: "John Doe",
        email: `${mockOrder.userId}@example.com`,
      });
    }
  });

// 4. Register consumers with full type safety
auk.consumer("order.processed", (order, ctx) => {
  // order is typed as { orderId: number, userId: string, amount: number }
  ctx.logger.info(`Order ${order.orderId} processed for ${order.userId}`);
});

auk.consumer("user.created", (user, ctx) => {
  // user is typed as { id: string, name: string, email: string }
  ctx.logger.info(`User ${user.name} created with email ${user.email}`);
});

// 5. Start the service
auk.start();
```

- **Type Safety**: Invalid event payloads fail at compile-time with full TypeScript inference
- **Fluent API**: Intuitive producer registration with `.producer().from().handle()` pattern
- **Flexible Triggers**: Built-in cron, message queue, and custom trigger support
- **Auto-Cleanup**: Timers and resources are automatically cleaned up on shutdown

---

## Distributed Mode

Auk supports distributed event processing using NATS message brokers. Events can be distributed across multiple application instances with different delivery guarantees and built-in Dead Letter Queue (DLQ) support.

### Features:
- **NATS Broker Support**: Built-in NATS integration with JetStream
- **Dead Letter Queue**: Automatic DLQ handling for failed messages
- **Load Balancing**: Queue delivery mode distributes work across instances
- **Broadcasting**: Broadcast delivery sends events to all instances
- **Auto-Cleanup**: Automatic resource management and graceful shutdown

```typescript
import { Auk, cron, T } from "auk";
import { NatsBroker } from "auk/addons/distributed/nats";

// Define event schemas
const Events = {
  "job.process": T.Object({
    jobId: T.String(),
    type: T.String(),
    payload: T.Any(),
  }),
} as const;

// Create NATS broker with DLQ support
const nats = new NatsBroker({
  servers: "nats://localhost:4222",
  dlq: {
    enabled: true,
    maxDeliver: 3,
    streamSuffix: ".DLQ",
    autoCreateStreams: true,
  },
});

// Create Auk instance with distributed mode
const auk = new Auk(Events, {
  mode: "distributed",
  broker: nats,
  config: {
    env: "development",
    serviceName: "distributed-worker",
  },
});

// Producer: generates jobs
auk
  .producer("job.process")
  .from(cron("*/10 * * * * *"))
  .withRetry({ max: 2 })
  .handle(async ({ ctx, emit }) => {
    const jobs = Array.from({ length: 5 }, (_, i) => ({
      jobId: `job-${i + 1}`,
      type: "data-processing",
      payload: { data: `sample-data-${i + 1}` },
    }));

    for (const job of jobs) {
      emit("job.process", job);
    }
  });

// Consumer: processes jobs (load-balanced across workers)
auk.consumer(
  "job.process",
  (job, ctx) => {
    ctx.logger.info(`Processing job: ${job.jobId}`);
    
    // Auto-cleanup timeouts
    ctx.setTimeout(() => {
      ctx.logger.info(`Job ${job.jobId} completed`);
    }, 500);
  },
  { delivery: "queue" } // Load-balanced across instances
);

auk.start();
```

**Delivery Modes:**

- `queue`: Load-balanced across instances (work distribution)
- `broadcast`: Sent to all instances (notifications, state sync)

**Auto-Cleanup Features:**

Auk provides `context.setInterval()` and `context.setTimeout()` that automatically register cleanup handlers. No need to manually clear timers during shutdown—the library handles it automatically.

---

## Documentation

- [API Reference](./docs/api.md) - Complete API documentation
- [Examples](./examples/) - Real-world usage patterns and examples
- [Middleware Guide](./docs/middleware.md) - Lifecycle hooks and middleware system

---

## Roadmap

Auk follows a modular architecture that keeps the core lightweight while providing extensibility through addons. Here's our development roadmap:

### **Core Library** ✅

**Keep the core as small, stable, and dependency-free as possible!**

- **Type-Safe Event Bus**: ✅ Complete
- **Modular Plugin/Module System**: ✅ Complete
- **Distributed Mode with NATS**: ✅ Complete
- **Dead Letter Queue (DLQ) for Distributed Instances**: ✅ Complete (via NATS JetStream)
- **Lifecycle Hooks**: 🔄 Partially Complete
- **Retry and DLQ Mechanism (interfaces)**: 🔄 In Progress
  - API contract for retry, backoff, DLQ
  - Event/job metadata for retries, attempts, and DLQ status
  - Core lifecycle events for failure, success, retry, etc.

### **Addons** 🚧

**All heavier features, extra dependencies, or optional integrations belong here.**

- **Persistence/Replay**: 📋 Planned
  - Adapters for event or job persistence (Redis Streams, JetStream, DB, etc.)
  - Replay tools/utilities

- **Monitoring/Instrumentation**: 📋 Planned
  - Plugins for Prometheus, Datadog, Grafana, Sentry, etc.
  - Metrics export/forwarders

- **Integrations**: 📋 Planned
  - Email, queues, cron/scheduler, webhooks, HTTP, databases, etc.

- **Security/Multi-Tenant**: 📋 Thinking about it
  - Middleware/plugins for auth, RBAC, tenancy, encryption

- **UI/Dashboard**: 📋 Thinking about it
  - As a completely separate package/service, or in `/addons/dashboard`

  ### **Status Legend**

- ✅ Complete
- 🔄 In Progress
- 📋 Planned

### **Architecture Principles**

- **Core = Contracts, Hooks, Lifecycle**: Provides extensibility points so users can hook in their own retry, DLQ, monitoring, etc.
- **Addons = Everything Else**: Implement actual integrations, heavy features, and dependencies

Even with the current feature-set (or lack thereof), Auk is designed to be modular and extensible. You can make your own plugins and modules to achieve your specific use-cases. If you end up building something cool, we'll put it in the addons package!
---

## License

MIT

---

### **What is Auk?**

> Auk is a type-safe, modular event bus and background job framework. It lets you decouple your background tasks, listeners, and workflows using modern TypeScript schemas and a plugin/module system.

---
