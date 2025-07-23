# Auk Examples

This guide provides comprehensive examples of using Auk for various event-driven patterns and use cases.
you can find more examples in the [examples](../examples/) directory.

---

## Basic Usage

### Simple Event Processing

```typescript
import { Auk, T } from "auk";

// Define event schemas with TypeBox
const Events = {
  "user.created": T.Object({
    id: T.String(),
    email: T.String(),
    name: T.String(),
  }),
  "order.processed": T.Object({
    orderId: T.String(),
    userId: T.String(),
    amount: T.Number(),
  }),
} as const;

// Create Auk instance
const auk = new Auk(Events);

// Register consumers (type-safe)
auk.consumer("user.created", async (event, ctx) => {
  ctx.logger.info(`New user: ${event.name} (${event.email})`);
  // Send welcome email, create user profile, etc.
});

auk.consumer("order.processed", async (event, ctx) => {
  ctx.logger.info(`Order ${event.orderId} processed for $${event.amount}`);
  // Update inventory, send confirmation, etc.
});

// Register a cron-based producer
auk.producer("user.created")
  .from(cron("*/30 * * * * *")) // Every 30 seconds
  .handle(async (ctx) => {
    // Simulate user registration
    const newUser = {
      id: `user_${Date.now()}`,
      email: `user${Date.now()}@example.com`,
      name: `User ${Date.now()}`,
    };
    
    await ctx.emit("user.created", newUser);
    ctx.logger.info("Simulated user creation");
  });

// Start the service
await auk.start();
```

---

## Producer Patterns

### Cron-Based Producers

```typescript
import { Auk, T, cron } from "auk";

const Events = {
  "metrics.collect": T.Object({
    timestamp: T.Number(),
    cpu: T.Number(),
    memory: T.Number(),
  }),
  "backup.create": T.Object({
    timestamp: T.Number(),
    tables: T.Array(T.String()),
  }),
} as const;

const auk = new Auk(Events);

// Collect metrics every minute
auk.producer("metrics.collect")
  .from(cron("0 * * * * *"))
  .handle(async (ctx) => {
    const metrics = {
      timestamp: Date.now(),
      cpu: Math.random() * 100,
      memory: Math.random() * 100,
    };
    
    await ctx.emit("metrics.collect", metrics);
  });

// Daily backup at 2 AM
auk.producer("backup.create")
  .from(cron("0 0 2 * * *"))
  .withRetry({ maxAttempts: 3, backoff: "exponential" })
  .handle(async (ctx) => {
    const backup = {
      timestamp: Date.now(),
      tables: ["users", "orders", "products"],
    };
    
    await ctx.emit("backup.create", backup);
    ctx.logger.info("Daily backup initiated");
  });

await auk.start();
```

### Message Queue Producers

```typescript
import { Auk, T, mqListener } from "auk";

// Mock MQ client implementation
class RedisMQClient {
  async subscribe(queue: string, handler: (message: any) => void) {
    // Redis subscription logic
    console.log(`Subscribed to ${queue}`);
  }
}

const Events = {
  "webhook.received": T.Object({
    source: T.String(),
    payload: T.Any(),
    timestamp: T.Number(),
  }),
} as const;

const auk = new Auk(Events);
const mqClient = new RedisMQClient();

// Process webhook messages from Redis queue
auk.producer("webhook.received")
  .from(mqListener(mqClient, "webhooks"))
  .withRetry({ maxAttempts: 5, backoff: "linear" })
  .handle(async (message, ctx) => {
    const webhook = {
      source: message.source || "unknown",
      payload: message.payload,
      timestamp: Date.now(),
    };
    
    await ctx.emit("webhook.received", webhook);
  });

await auk.start();
```

### Custom Trigger Sources

```typescript
import { Auk, T, TriggerSource } from "auk";

// Custom file watcher trigger
function fileWatcher(path: string): TriggerSource<{ file: string; event: string }> {
  return {
    async start(handler) {
      // File system watcher implementation
      const watcher = fs.watch(path, (eventType, filename) => {
        handler({ file: filename, event: eventType });
      });
      
      return () => watcher.close();
    },
  };
}

const Events = {
  "file.changed": T.Object({
    filename: T.String(),
    eventType: T.String(),
    timestamp: T.Number(),
  }),
} as const;

const auk = new Auk(Events);

// Watch for file changes
auk.producer("file.changed")
  .from(fileWatcher("/tmp/watched"))
  .handle(async (trigger, ctx) => {
    await ctx.emit("file.changed", {
      filename: trigger.file,
      eventType: trigger.event,
      timestamp: Date.now(),
    });
  });

await auk.start();
```

---

## Consumer Patterns

### Multiple Consumers for Same Event

```typescript
const Events = {
  "user.created": T.Object({
    id: T.String(),
    email: T.String(),
    name: T.String(),
  }),
} as const;

const auk = new Auk(Events);

// Email service consumer
auk.consumer("user.created", async (event, ctx) => {
  ctx.logger.info(`Sending welcome email to ${event.email}`);
  // Email service integration
});

// Analytics consumer
auk.consumer("user.created", async (event, ctx) => {
  ctx.logger.info(`Recording user signup: ${event.id}`);
  // Analytics service integration
});

// CRM consumer
auk.consumer("user.created", async (event, ctx) => {
  ctx.logger.info(`Adding user to CRM: ${event.name}`);
  // CRM service integration
});

await auk.start();
```

### Error Handling in Consumers

```typescript
const Events = {
  "payment.process": T.Object({
    orderId: T.String(),
    amount: T.Number(),
    currency: T.String(),
  }),
} as const;

const auk = new Auk(Events);

auk.consumer("payment.process", async (event, ctx) => {
  try {
    // Payment processing logic
    const result = await processPayment(event);
    ctx.logger.info(`Payment processed: ${event.orderId}`);
    
    // Emit success event
    await ctx.emit("payment.completed", {
      orderId: event.orderId,
      transactionId: result.transactionId,
    });
  } catch (error) {
    ctx.logger.error(`Payment failed: ${event.orderId}`, error);
    
    // Emit failure event
    await ctx.emit("payment.failed", {
      orderId: event.orderId,
      reason: error.message,
    });
    
    // Re-throw to trigger retry mechanism
    throw error;
  }
});

await auk.start();
```

---

## Distributed Mode

### NATS Broker Setup

```typescript
import { Auk, T, NatsBroker } from "auk";

const Events = {
  "job.run": T.Object({
    id: T.String(),
    type: T.String(),
    payload: T.Any(),
  }),
  "job.completed": T.Object({
    id: T.String(),
    result: T.Any(),
    duration: T.Number(),
  }),
} as const;

// Configure NATS broker
const broker = new NatsBroker({
  servers: ["nats://localhost:4222"],
  jetstream: {
    domain: "auk-cluster",
    streams: {
      "job-stream": {
        subjects: ["job.*"],
        retention: "workqueue",
        storage: "file",
      },
    },
  },
  dlq: {
    enabled: true,
    maxAttempts: 3,
    stream: "dlq-stream",
  },
});

const auk = new Auk(Events, {
  mode: "distributed",
  broker,
});

// Producer instance
if (process.argv.includes("--producer")) {
  auk.producer("job.run")
    .from(cron("*/10 * * * * *"))
    .handle(async (ctx) => {
      const job = {
        id: `job_${Date.now()}`,
        type: "data-processing",
        payload: { batch: Math.floor(Math.random() * 1000) },
      };
      
      await ctx.emit("job.run", job);
      ctx.logger.info(`Job queued: ${job.id}`);
    });
}

// Consumer instance
if (process.argv.includes("--consumer")) {
  auk.consumer("job.run", async (event, ctx) => {
    const start = Date.now();
    
    try {
      // Simulate job processing
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      const duration = Date.now() - start;
      
      await ctx.emit("job.completed", {
        id: event.id,
        result: { processed: true },
        duration,
      });
      
      ctx.logger.info(`Job completed: ${event.id} in ${duration}ms`);
    } catch (error) {
      ctx.logger.error(`Job failed: ${event.id}`, error);
      throw error; // Will be retried and eventually sent to DLQ
    }
  });
}

await auk.start();
```

### Load Balancing

```typescript
// Multiple consumer instances for load balancing
const auk = new Auk(Events, {
  mode: "distributed",
  broker,
  config: {
    consumer: {
      // Each instance gets a unique consumer group
      group: `worker-${process.env.INSTANCE_ID || Math.random()}`,
      // Load balance across instances
      loadBalance: true,
    },
  },
});

// Heavy processing consumer
auk.consumer("heavy.task", async (event, ctx) => {
  ctx.logger.info(`Processing on instance ${process.env.INSTANCE_ID}`);
  
  // CPU-intensive work
  await heavyProcessing(event.data);
  
  ctx.logger.info(`Completed on instance ${process.env.INSTANCE_ID}`);
});

await auk.start();
```

---

## Middleware Examples

### Request Tracing

```typescript
import { AukMiddleware } from "auk";

class TracingMiddleware implements AukMiddleware<typeof Events> {
  async onEventProduced({ eventName, payload, ctx }) {
    const traceId = `trace_${Date.now()}_${Math.random()}`;
    ctx.set("traceId", traceId);
    ctx.logger.info(`[${traceId}] Event produced: ${String(eventName)}`);
  }

  async onEventConsumed({ eventName, payload, ctx }) {
    const traceId = ctx.get("traceId") || "unknown";
    ctx.logger.info(`[${traceId}] Event consumed: ${String(eventName)}`);
  }

  async onConsumeError({ eventName, error, ctx }) {
    const traceId = ctx.get("traceId") || "unknown";
    ctx.logger.error(`[${traceId}] Error in ${String(eventName)}:`, error);
  }
}

auk.useMiddleware(new TracingMiddleware());
```

### Rate Limiting

```typescript
class RateLimitMiddleware implements AukMiddleware<typeof Events> {
  private limits = new Map<string, { count: number; resetTime: number }>();
  private readonly maxRequests = 100;
  private readonly windowMs = 60000; // 1 minute

  async onEventDispatch({ eventName, consumers }) {
    const key = String(eventName);
    const now = Date.now();
    const limit = this.limits.get(key);

    if (!limit || now > limit.resetTime) {
      this.limits.set(key, { count: 1, resetTime: now + this.windowMs });
      return;
    }

    if (limit.count >= this.maxRequests) {
      throw new Error(`Rate limit exceeded for ${key}`);
    }

    limit.count++;
  }
}

auk.useMiddleware(new RateLimitMiddleware());
```

---

## Testing Examples

### Unit Testing Consumers

```typescript
import { describe, it, expect, beforeEach } from "bun:test";
import { Auk, T } from "auk";

const Events = {
  "user.created": T.Object({
    id: T.String(),
    email: T.String(),
  }),
} as const;

describe("User Creation Handler", () => {
  let auk: Auk<typeof Events>;
  let emailsSent: any[] = [];

  beforeEach(() => {
    auk = new Auk(Events);
    emailsSent = [];

    // Mock email service
    auk.consumer("user.created", async (event, ctx) => {
      emailsSent.push({
        to: event.email,
        subject: "Welcome!",
        timestamp: Date.now(),
      });
    });
  });

  it("should send welcome email on user creation", async () => {
    // Emit test event
    await auk.emit("user.created", {
      id: "test-user",
      email: "test@example.com",
    });

    // Wait for processing
    await new Promise(resolve => setTimeout(resolve, 100));

    expect(emailsSent).toHaveLength(1);
    expect(emailsSent[0].to).toBe("test@example.com");
  });
});
```

### Integration Testing

```typescript
import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { Auk, T, NatsBroker } from "auk";

describe("Distributed Job Processing", () => {
  let producer: Auk<typeof Events>;
  let consumer: Auk<typeof Events>;
  let broker: NatsBroker;
  let processedJobs: any[] = [];

  beforeAll(async () => {
    broker = new NatsBroker({
      servers: ["nats://localhost:4222"],
    });

    producer = new Auk(Events, { mode: "distributed", broker });
    consumer = new Auk(Events, { mode: "distributed", broker });

    consumer.consumer("job.run", async (event, ctx) => {
      processedJobs.push(event);
      await ctx.emit("job.completed", {
        id: event.id,
        result: "success",
      });
    });

    await Promise.all([producer.start(), consumer.start()]);
  });

  afterAll(async () => {
    await Promise.all([producer.shutdown(), consumer.shutdown()]);
  });

  it("should process jobs across instances", async () => {
    // Emit job from producer
    await producer.emit("job.run", {
      id: "test-job",
      type: "test",
      payload: { data: "test" },
    });

    // Wait for processing
    await new Promise(resolve => setTimeout(resolve, 1000));

    expect(processedJobs).toHaveLength(1);
    expect(processedJobs[0].id).toBe("test-job");
  });
});
```

---

## Performance Optimization

### Batch Processing

```typescript
const Events = {
  "batch.process": T.Object({
    items: T.Array(T.Any()),
    batchId: T.String(),
  }),
} as const;

const auk = new Auk(Events);

// Batch collector
class BatchProcessor {
  private batch: any[] = [];
  private batchTimeout: Timer | null = null;
  private readonly batchSize = 100;
  private readonly batchTimeoutMs = 5000;

  constructor(private auk: Auk<typeof Events>) {}

  addItem(item: any) {
    this.batch.push(item);

    if (this.batch.length >= this.batchSize) {
      this.processBatch();
    } else if (!this.batchTimeout) {
      this.batchTimeout = setTimeout(() => {
        this.processBatch();
      }, this.batchTimeoutMs);
    }
  }

  private async processBatch() {
    if (this.batch.length === 0) return;

    const items = [...this.batch];
    this.batch = [];

    if (this.batchTimeout) {
      clearTimeout(this.batchTimeout);
      this.batchTimeout = null;
    }

    await this.auk.emit("batch.process", {
      items,
      batchId: `batch_${Date.now()}`,
    });
  }
}

const batchProcessor = new BatchProcessor(auk);

// Process batches efficiently
auk.consumer("batch.process", async (event, ctx) => {
  ctx.logger.info(`Processing batch ${event.batchId} with ${event.items.length} items`);
  
  // Parallel processing
  await Promise.all(
    event.items.map(async (item) => {
      // Process individual item
      await processItem(item);
    })
  );
  
  ctx.logger.info(`Batch ${event.batchId} completed`);
});

await auk.start();
```

These examples demonstrate the flexibility and power of Auk for building robust, scalable event-driven applications. Each pattern can be combined and customized to fit your specific use case.