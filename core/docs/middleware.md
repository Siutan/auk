# Auk Middleware System

Auk provides a comprehensive middleware system for monitoring, logging, metrics collection, error handling, and custom business logic throughout the event lifecycle.

---

## Overview

The middleware system provides hooks at every stage of the event-driven lifecycle:

- **Auk Lifecycle**: Instance initialisation and startup
- **Producer Lifecycle**: Registration, trigger attachment, and event production
- **Consumer Lifecycle**: Event dispatch and consumption
- **Error Handling**: Production and consumption failures
- **Retry Logic**: Retry attempts and exhaustion
- **Distributed Events**: DLQ handling and message metadata

---

## Simple Middleware

For basic event processing middleware, use the simple middleware API:

```typescript
import { Auk, T } from "auk";

const Events = {
  "user.created": T.Object({ id: T.String(), email: T.String() }),
} as const;

const auk = new Auk(Events);

// Simple middleware function
auk.middleware((event, next) => {
  console.log(`Processing event: ${event.event}`);
  
  const start = Date.now();
  const result = next();
  const duration = Date.now() - start;
  
  console.log(`Event ${event.event} processed in ${duration}ms`);
  return result;
});
```

---

## Advanced Middleware

For comprehensive lifecycle management, implement the `AukMiddleware` interface:

```typescript
import { AukMiddleware } from "auk";

class MetricsMiddleware implements AukMiddleware<typeof Events> {
  private metrics = {
    eventsProduced: 0,
    eventsConsumed: 0,
    errors: 0,
    retries: 0,
  };

  async onAukStart({ auk }) {
    console.log("Metrics middleware initialised");
    
    // Start metrics reporting
    auk.ctx().setInterval(() => {
      console.log("Metrics:", this.metrics);
    }, 10000);
  }

  async onEventProduced({ eventName, payload, ctx }) {
    this.metrics.eventsProduced++;
    ctx.logger.debug(`Event produced: ${String(eventName)}`);
  }

  async onEventConsumed({ eventName, payload, consumer, ctx }) {
    this.metrics.eventsConsumed++;
    ctx.logger.debug(`Event consumed: ${String(eventName)}`);
  }

  async onProduceError({ eventName, error, ctx }) {
    this.metrics.errors++;
    ctx.logger.error(`Production error for ${String(eventName)}:`, error);
  }

  async onConsumeError({ eventName, error, ctx }) {
    this.metrics.errors++;
    ctx.logger.error(`Consumption error for ${String(eventName)}:`, error);
  }

  async onRetryAttempt({ eventName, attemptNumber, maxAttempts, ctx }) {
    this.metrics.retries++;
    ctx.logger.warn(`Retry ${attemptNumber}/${maxAttempts} for ${String(eventName)}`);
  }
}

// Register the middleware
auk.useMiddleware(new MetricsMiddleware());
```

---

## Lifecycle Hooks

The `AukMiddleware` interface provides hooks for every stage of the lifecycle:

### Auk Lifecycle

- `onAukInit({ auk })`: Called when Auk instance is initialised
- `onAukStart({ auk })`: Called when Auk instance starts up
- `onAukShutdown({ auk })`: Called when Auk instance is shutting down

### Producer Lifecycle

- `onProducerRegistered({ auk, eventName, builder })`: Called when a producer is registered
- `onSourceAttached({ eventName, source })`: Called when a trigger source is attached
- `onHandlerAttached({ eventName, handler })`: Called when a handler is attached
- `onTriggerStart({ eventName, source })`: Called when a trigger starts
- `onEventProduced({ eventName, payload, ctx })`: Called when an event is produced
- `onProduceError({ eventName, payload, error, ctx })`: Called when production fails

### Consumer Lifecycle

- `onEventDispatch({ eventName, payload, consumers })`: Called before dispatching to consumers
- `onEventConsumed({ eventName, payload, consumer, ctx })`: Called when an event is consumed
- `onConsumeError({ eventName, payload, error, ctx, consumer })`: Called when consumption fails

### Retry and DLQ

- `onRetryAttempt({ eventName, payload, attemptNumber, maxAttempts, error, ctx })`: Called on retry attempts
- `onRetryExhausted({ eventName, payload, totalAttempts, finalError, ctx })`: Called when retries are exhausted
- `onDLQMessage({ eventName, payload, metadata, ctx })`: Called when a message is sent to DLQ

---

## Common Middleware Patterns

### Logging Middleware

```typescript
class LoggingMiddleware implements AukMiddleware<typeof Events> {
  async onEventProduced({ eventName, payload, ctx }) {
    ctx.logger.info(`📤 Produced: ${String(eventName)}`, { payload });
  }

  async onEventConsumed({ eventName, payload, ctx }) {
    ctx.logger.info(`📥 Consumed: ${String(eventName)}`, { payload });
  }

  async onProduceError({ eventName, error, ctx }) {
    ctx.logger.error(`❌ Production failed: ${String(eventName)}`, { error: error.message });
  }

  async onConsumeError({ eventName, error, ctx }) {
    ctx.logger.error(`❌ Consumption failed: ${String(eventName)}`, { error: error.message });
  }
}
```

### Performance Monitoring

```typescript
class PerformanceMiddleware implements AukMiddleware<typeof Events> {
  private timers = new Map<string, number>();

  async onEventDispatch({ eventName }) {
    this.timers.set(String(eventName), Date.now());
  }

  async onEventConsumed({ eventName, ctx }) {
    const start = this.timers.get(String(eventName));
    if (start) {
      const duration = Date.now() - start;
      ctx.logger.debug(`⏱️  ${String(eventName)} processed in ${duration}ms`);
      this.timers.delete(String(eventName));
    }
  }
}
```

### Error Alerting

```typescript
class AlertingMiddleware implements AukMiddleware<typeof Events> {
  private errorCounts = new Map<string, number>();

  async onConsumeError({ eventName, error, ctx }) {
    const key = String(eventName);
    const count = (this.errorCounts.get(key) || 0) + 1;
    this.errorCounts.set(key, count);

    if (count >= 5) {
      // Send alert after 5 consecutive errors
      ctx.logger.error(`🚨 ALERT: ${key} has failed ${count} times`, { error });
      // Integration with alerting service would go here
    }
  }

  async onEventConsumed({ eventName }) {
    // Reset error count on successful processing
    this.errorCounts.delete(String(eventName));
  }
}
```

### Circuit Breaker

```typescript
class CircuitBreakerMiddleware implements AukMiddleware<typeof Events> {
  private circuits = new Map<string, { failures: number; lastFailure: number; isOpen: boolean }>();
  private readonly threshold = 5;
  private readonly timeout = 60000; // 1 minute

  async onEventDispatch({ eventName, consumers }) {
    const key = String(eventName);
    const circuit = this.circuits.get(key);

    if (circuit?.isOpen) {
      const now = Date.now();
      if (now - circuit.lastFailure > this.timeout) {
        // Reset circuit breaker
        circuit.isOpen = false;
        circuit.failures = 0;
      } else {
        // Circuit is open, skip processing
        throw new Error(`Circuit breaker is open for ${key}`);
      }
    }
  }

  async onConsumeError({ eventName, ctx }) {
    const key = String(eventName);
    const circuit = this.circuits.get(key) || { failures: 0, lastFailure: 0, isOpen: false };
    
    circuit.failures++;
    circuit.lastFailure = Date.now();
    
    if (circuit.failures >= this.threshold) {
      circuit.isOpen = true;
      ctx.logger.warn(`🔴 Circuit breaker opened for ${key}`);
    }
    
    this.circuits.set(key, circuit);
  }

  async onEventConsumed({ eventName }) {
    // Reset failures on successful processing
    const key = String(eventName);
    const circuit = this.circuits.get(key);
    if (circuit) {
      circuit.failures = 0;
    }
  }
}
```

---

## Multiple Middleware

You can register multiple middleware instances:

```typescript
auk
  .useMiddleware(new LoggingMiddleware())
  .useMiddleware(new MetricsMiddleware())
  .useMiddleware(new PerformanceMiddleware())
  .useMiddleware(new AlertingMiddleware());
```

Middleware is executed in registration order for most hooks. For error hooks, all middleware is notified regardless of execution order.

---

## Best Practices

1. **Keep middleware focused**: Each middleware should have a single responsibility
2. **Handle errors gracefully**: Middleware errors shouldn't crash the application
3. **Use async/await**: Most hooks support async operations
4. **Leverage context**: Use the provided context for logging and configuration
5. **Clean up resources**: Use cleanup handlers for any resources created in middleware
6. **Monitor performance**: Be mindful of middleware overhead in high-throughput scenarios

---

## Legacy Hooks (Deprecated)

The legacy `LifecycleHooks` interface is still supported but deprecated:

```typescript
// Deprecated - use AukMiddleware instead
bus.hooks({
  onReceived: (event, metadata) => {
    console.log("Event received:", event);
  },
  onSuccess: (event, metadata) => {
    console.log("Event processed:", event);
  },
  onFailed: (event, error, metadata) => {
    console.error("Event failed:", event, error);
  },
});
```

Migrate to the new `AukMiddleware` interface for better type safety and more comprehensive lifecycle coverage.

## Middleware Types

### 1. Simple Middleware (`MiddlewareFn`)

Simple middleware functions transform events synchronously or asynchronously:

```typescript
import { type MiddlewareFn, type AukEvent } from "auk";

const timestampMiddleware: MiddlewareFn = (event: AukEvent) => {
  return {
    ...event,
    data: {
      ...(event.data as Record<string, any>),
      processedAt: new Date().toISOString(),
    },
  };
};

auk.middleware(timestampMiddleware);
```

**Use simple middleware for:**

- Data transformation
- Adding metadata to events
- Simple validation
- Event enrichment

### 2. Advanced Middleware (`AdvancedMiddlewareFn`)

Advanced middleware has access to context and the `next()` function, enabling complex control flow:

```typescript
import { type AdvancedMiddlewareFn } from "auk";

const loggingMiddleware: AdvancedMiddlewareFn = async (
  event,
  context,
  next
) => {
  const start = performance.now();
  console.log(`Processing ${event.event}...`);

  try {
    const result = await next();
    const duration = performance.now() - start;
    console.log(`✅ Completed in ${duration.toFixed(2)}ms`);
    return result;
  } catch (error) {
    console.error(`❌ Failed:`, error);
    throw error;
  }
};

auk.middleware(loggingMiddleware);
```

**Use advanced middleware for:**

- Logging and monitoring
- Error handling
- Rate limiting
- Circuit breakers
- Authentication/authorization

## Built-in Middleware

Auk provides several pre-built middleware functions:

### Logging Middleware

```typescript
import { logging } from "auk";

auk.middleware(
  logging({
    level: "info",
    includeData: true,
    includeMetadata: true,
    filter: (eventName) => eventName.startsWith("user."),
    logger: customLogger,
  })
);
```

### Rate Limiting

```typescript
import { rateLimit } from "auk";

auk.middleware(
  rateLimit({
    maxRequests: 100,
    windowMs: 60000, // 1 minute
    keyGenerator: (event) => `user-${event.data.userId}`,
    onExceeded: (event) =>
      console.warn(`Rate limit exceeded for ${event.event}`),
  })
);
```

### Validation

```typescript
import { validation } from "auk";

auk.middleware(
  validation({
    validate: (data) => {
      if (!data.email || !data.email.includes("@")) {
        return "Invalid email format";
      }
      return true;
    },
    throwOnError: true,
  })
);
```

### Metrics Collection

```typescript
import { metrics } from "auk";

const metricsCollector = {
  increment: (metric, labels) => {
    /* your metrics logic */
  },
  timing: (metric, duration, labels) => {
    /* your timing logic */
  },
  gauge: (metric, value, labels) => {
    /* your gauge logic */
  },
};

auk.middleware(
  metrics({
    collector: metricsCollector,
    includeEventMetrics: true,
    includeTiming: true,
  })
);
```

### Correlation IDs

```typescript
import { correlationId } from "auk";

auk.middleware(
  correlationId({
    generator: () =>
      `trace-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    header: "traceId",
  })
);
```

### Circuit Breaker

```typescript
import { circuitBreaker } from "auk";

auk.middleware(
  circuitBreaker({
    failureThreshold: 5,
    resetTimeout: 30000, // 30 seconds
    monitoringPeriod: 60000, // 1 minute
  })
);
```

### Timing Information

```typescript
import { timing } from "auk";

auk.middleware(timing()); // Adds _timing data to events
```

## Middleware Composition

You can compose multiple middleware functions using the `compose` utility:

```typescript
import { compose, logging, rateLimit, validation, timing } from "auk";

const composedMiddleware = compose(
  logging({ level: "info" }),
  rateLimit({ maxRequests: 100, windowMs: 60000 }),
  validation({
    validate: (data) => typeof data === "object" && data !== null,
  }),
  timing()
);

auk.middleware(composedMiddleware);
```

**Execution Order:** Middleware executes in the order you register it. With `compose()`, middleware is applied in the order listed.

## Type Safety

All middleware functions are fully typed and work seamlessly with TypeScript:

```typescript
import { Type, type Static, type MiddlewareFn } from "auk";

const UserSchema = Type.Object({
  id: Type.Number(),
  name: Type.String(),
  email: Type.String(),
});

type UserEvent = Static<typeof UserSchema>;

// Type-safe middleware
const userValidationMiddleware: MiddlewareFn = (event) => {
  if (event.event === "user.created") {
    const userData = event.data as UserEvent;
    if (!userData.email.includes("@")) {
      throw new Error("Invalid email");
    }
  }
  return event;
};
```

## Best Practices

### 1. Order Matters

Register middleware in the order you want them to execute:

```typescript
// ✅ Good: logging first, then validation
auk.middleware(logging());
auk.middleware(validation());

// ❌ Bad: validation might fail before logging
auk.middleware(validation());
auk.middleware(logging());
```

### 2. Error Handling

Always handle errors gracefully in advanced middleware:

```typescript
const errorHandlingMiddleware: AdvancedMiddlewareFn = async (
  event,
  context,
  next
) => {
  try {
    return await next();
  } catch (error) {
    // Log error, send to monitoring, etc.
    console.error("Middleware error:", error);

    // Decide whether to rethrow or handle gracefully
    throw error;
  }
};
```

### 3. Performance Considerations

- Use simple middleware for lightweight transformations
- Use advanced middleware only when you need context or control flow
- Avoid heavy computations in middleware
- Consider caching and memoization for expensive operations

### 4. Testing Middleware

Test middleware in isolation:

```typescript
import { describe, it, expect } from "bun:test";

describe("timestampMiddleware", () => {
  it("should add timestamp to event data", () => {
    const event = {
      event: "test",
      data: { message: "hello" },
    };

    const result = timestampMiddleware(event);

    expect(result.data.processedAt).toBeDefined();
    expect(result.data.message).toBe("hello");
  });
});
```

## Real-World Examples

### E-commerce Order Processing

```typescript
import {
  Auk,
  compose,
  correlationId,
  logging,
  metrics,
  rateLimit,
  validation,
  timing,
} from "auk";

// Business rules middleware
const businessRulesMiddleware: AdvancedMiddlewareFn = async (
  event,
  context,
  next
) => {
  if (event.event === "order.created") {
    const data = event.data as any;

    // High value orders require approval
    if (data.amount > 1000) {
      return {
        ...(await next()),
        data: {
          ...data,
          requiresApproval: true,
          approvalReason: "High value transaction",
        },
      };
    }
  }

  return await next();
};

// Compose comprehensive middleware stack
const ecommerceMiddleware = compose(
  correlationId({ header: "orderTraceId" }),
  logging({ level: "info", includeData: true }),
  metrics({ includeEventMetrics: true }),
  rateLimit({ maxRequests: 10, windowMs: 1000 }),
  validation({
    validate: (data) => {
      if (data.orderId && data.amount && data.amount > 0) {
        return true;
      }
      return "Invalid order data";
    },
  }),
  businessRulesMiddleware,
  timing()
);

const auk = new Auk()
  .event("order.created", OrderSchema)
  .middleware(ecommerceMiddleware);
```

### Microservices Communication

```typescript
// Service-to-service tracing
const tracingMiddleware: AdvancedMiddlewareFn = async (
  event,
  context,
  next
) => {
  const span = tracer.startSpan(event.event);

  try {
    const result = await next();
    span.setStatus({ code: SpanStatusCode.OK });
    return result;
  } catch (error) {
    span.setStatus({
      code: SpanStatusCode.ERROR,
      message: error.message,
    });
    throw error;
  } finally {
    span.end();
  }
};

// Authentication middleware
const authMiddleware: AdvancedMiddlewareFn = async (event, context, next) => {
  const authHeader = event.data?.headers?.authorization;

  if (!authHeader) {
    throw new Error("Missing authorization header");
  }

  const user = await verifyToken(authHeader);

  return {
    ...(await next()),
    data: {
      ...event.data,
      user,
      authenticated: true,
    },
  };
};
```

## Migration from Untyped Middleware

If you're migrating from untyped middleware, here's how to update:

### Before (Untyped)

```typescript
auk.middleware((event) => {
  // No type safety
  event.data.processedAt = Date.now();
  return event;
});
```

### After (Typed)

```typescript
import { type MiddlewareFn, type AukEvent } from "auk";

const timestampMiddleware: MiddlewareFn = (event: AukEvent) => {
  return {
    ...event,
    data: {
      ...(event.data as Record<string, any>),
      processedAt: Date.now(),
    },
  };
};

auk.middleware(timestampMiddleware);
```

## Conclusion

Auk's middleware system provides a powerful, type-safe way to extend your event bus functionality. By combining simple and advanced middleware with built-in utilities, you can create sophisticated event processing pipelines that are maintainable, testable, and performant.

For more examples, see the `examples/middleware-demo.ts` file in the repository.
