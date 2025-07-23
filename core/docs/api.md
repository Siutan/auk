# Auk API Reference

This document describes the public API of the Auk event bus and background job framework.

---

## Core Concepts

### Event Schemas

Auk uses TypeBox for defining type-safe event schemas:

```typescript
import { T } from "auk";

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
```

Events are registered as the first argument of an auk instance:
```ts
const auk = new Auk(Events, { config: { env: "development" } });
```

### Fluent Producer API

Producers are registered using the fluent API pattern:

```typescript
auk
  .producer("event.name")
  .from(trigger) // cron, mqListener, etc.
  .withRetry({ max: 3 }) // optional
  .handle(({ payload, ctx, emit }) => {
    // Handler logic
  });
```

### Consumers

Consumers listen to events with full type safety:

```typescript
auk.consumer("event.name", (payload, ctx) => {
  // payload is fully typed based on event schema
  ctx.logger.info("Processing event", payload);
});
```

---

## Classes

### Auk

The main class for event bus setup, producer/consumer registration, and service lifecycle management.

#### Constructor

```typescript
new Auk<Events>(events: Events, options?: {
  config?: AukConfig;
  logger?: AukContext["logger"];
  mode?: "local" | "distributed";
  broker?: Broker;
})
```

- `events`: Event schemas object defining all available events
- `config`: Optional configuration object
- `logger`: Optional custom logger
- `mode`: Operating mode - "local" for single instance, "distributed" for multi-instance
- `broker`: Message broker for distributed mode (e.g., NatsBroker)

#### Producer Methods

- `.producer<E>(eventName: E)`: Start building a producer for the specified event
- Returns a `ProducerBuilder` for fluent configuration

#### Consumer Methods

- `.consumer<E>(eventName: E, handler: ConsumerFn, options?)`: Register an event consumer
- `handler`: Function that receives typed payload and context
- `options`: Optional delivery mode and other consumer options

#### Lifecycle Methods

- `.start()`: Start the service with signal handling and blocking execution
- `.startNonBlocking()`: Start the service without blocking (for tests)
- `.shutdown()`: Perform graceful shutdown with cleanup
- `.addCleanupHandler(name, fn)`: Register a cleanup handler

#### Middleware Methods

- `.middleware(fn)`: Register simple middleware function
- `.useMiddleware(mw)`: Register comprehensive lifecycle middleware

#### Utility Methods

- `.use(fn)`: Register a module function that configures the Auk instance
- `.compose(other)`: Compose with another Auk instance, merging event schemas
- `.ctx()`: Get the current context object
- `.emit<E>(eventName, payload)`: Emit an event programmatically

---

### ProducerBuilder

Fluent builder for configuring producers with triggers, retry logic, and handlers.

#### Methods

- `.from<T>(trigger: TriggerSource<T>)`: Bind a trigger source to the producer
- `.withRetry(opts: { max: number })`: Configure retry behavior
- `.handle(handler: ProducerBuilderHandler)`: Register the producer handler function

### AukBus

Internal event bus that handles event routing and middleware.

#### Methods

- `.middleware(fn)`: Register simple event middleware
- `.advancedMiddleware(fn)`: Register advanced middleware with metadata
- `.emit(eventObj)`: Emit an event with middleware processing
- `.on(event, listener)`: Register an event listener
- `.off(event, listener)`: Remove an event listener
- `.once(event, listener)`: Register a one-time event listener

---

## Triggers

### Built-in Triggers

- `cron(expression: string)`: Create a cron-based trigger
- `mqListener<T>(queue: string, client: MQClient<T>)`: Create a message queue trigger

### Custom Triggers

Implement the `TriggerSource<T>` interface:

```typescript
interface TriggerSource<T> {
  subscribe(listener: (payload: T) => void | Promise<void>): (() => void) | void;
}
```

---

## Types

### Core Types

- `EventSchemas`: Record of event names to TypeBox schemas
- `AukMode`: "local" | "distributed" - operating mode
- `Delivery`: "queue" | "broadcast" - delivery mode for distributed events
- `AukEvent<T>`: Event object with event name and typed data
- `CleanupFn`: Cleanup function signature for graceful shutdown

### Context Types

- `AukContext`: Context object with logger, config, health, and utility methods
- `AukConfig`: Configuration object for Auk service
- `HealthStatus`: Health check status object

### Handler Types

- `ProducerBuilderHandler<SP, Context, Events>`: Producer handler with payload, context, and emit
- `ConsumerFn<T, Context>`: Consumer handler with typed payload and context
- `MiddlewareFn`: Simple middleware function signature
- `AdvancedMiddlewareFn`: Advanced middleware with metadata

### Middleware Types

- `AukMiddleware<Events>`: Comprehensive lifecycle middleware interface
- `LifecycleHooks`: Legacy lifecycle hooks (deprecated)
- `MessageMetadata`: Metadata for lifecycle events

---

## TypeBox Re-exports

Auk re-exports TypeBox types and helpers for schema-based event typing:

```typescript
import { T, Static, TSchema, Value } from "auk";
```

---

## Distributed Mode

### NatsBroker

NATS message broker implementation for distributed mode:

```typescript
import { NatsBroker } from "auk/addons/distributed/nats";

const broker = new NatsBroker({
  servers: "nats://localhost:4222",
  dlq: {
    enabled: true,
    maxDeliver: 3,
    streamSuffix: ".DLQ",
    autoCreateStreams: true,
  },
});
```

### Broker Interface

Custom brokers must implement the `Broker` interface:

```typescript
interface Broker {
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  publish(subject: string, data: any, options?: any): Promise<void>;
  subscribe(subject: string, handler: (data: any) => void, options?: any): Promise<() => void>;
}
```

---

## Usage Patterns

- **Type Safety**: Define event schemas with TypeBox for compile-time validation
- **Producers**: Use the fluent API for intuitive producer configuration
- **Consumers**: Register typed event handlers with automatic payload validation
- **Triggers**: Combine built-in triggers or create custom ones for any event source
- **Middleware**: Use lifecycle hooks for monitoring, logging, metrics, and error handling
- **Distributed**: Scale across multiple instances with NATS broker and delivery modes
- **Cleanup**: Leverage auto-cleanup features for resource management

For more details and examples, see the [Examples](../examples/) directory.
