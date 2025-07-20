# Auk Middleware System Guide

## Overview

Auk's middleware system is inspired by Express and Elysia, providing a powerful way to extend the functionality of your event bus. Middleware allows you to:

- Transform events before they reach listeners
- Add logging, metrics, and observability
- Implement cross-cutting concerns like validation, rate limiting, and authentication
- Compose complex processing pipelines

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
