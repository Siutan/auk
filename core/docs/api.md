# Auk API Reference

This document describes the public API of the Auk library as defined in `src/index.ts` and the new global event system in `src/events.ts`.

---

## Global Event System (NEW)

Auk now uses a global, augmentable event map and schema registry for type-safe, ergonomic event-driven development.

### Event Registration

- `defineEvent(eventName, schema)`: Register an event and its TypeBox schema globally. Use module augmentation to add to the `AukEvents` interface for type inference everywhere.

### Producer/Consumer Helpers

- `createProducer(event, fn)`: Create a type-safe event producer. The payload type is inferred from the global event map.
- `createConsumer(event, fn)`: Create a type-safe event consumer. The payload type is inferred from the global event map.

#### Producer Handler Pattern

Producer handlers can now be defined with optional `ctx` and `emit` parameters:

```typescript
// Full handler with ctx and emit
app.messageQueueProducer("order.processed", {
  handler: ({ payload, ctx, emit }) => {
    ctx.logger.info("Processing order", payload);
    emit("another.event", { /* data */ });
  },
});

// Simplified handler with just payload
app.messageQueueProducer("order.processed", {
  handler: ({ payload }) => {
    console.log(`Processing order ${payload.orderId}`);
  },
});
```

The `ctx` and `emit` parameters are automatically injected by Auk when the handler is called. Thanks to TypeScript's type inference, you only need to include them in your handler's signature if you intend to use them. When you do, they are guaranteed to be present and correctly typed, so no non-null assertions are needed.

This provides a clean and ergonomic way to define producer handlers, whether you need the full context or just the payload.

### Webhook Handler

- `aukWebhookHandler(req)`: Type-safe handler for `{ type, data }` events. Validates the event type and payload using the global registry.

---

## Classes

### Auk

The main class for service setup, plugin/module registration, and startup.

#### Constructor

```typescript
new Auk(options?: { config?: AukConfig; logger?: AukContext["logger"]; ... })
```

- `config`: Optional configuration object.
- `logger`: Optional custom logger.

#### Methods

- `.plugins(...pluginFns)`: Register one or more plugins.
- `.modules(...moduleFns)`: Register one or more modules.
- `.addCleanupHandler(name, fn)`: Register a cleanup handler for shutdown.
- `.updateHealthCheck(checkName, isHealthy)`: Update a health check status.
- `.getHealthStatus()`: Get the current health status.
- `.shutdown()`: Perform graceful shutdown.
- `.start()`: Start the Auk service (registers modules, then runs plugins).

---

### AukBus

A type-safe event bus that wraps Node's EventEmitter.

#### Methods

- `.middleware(fn)`: Register event middleware.
- `.emitSync(eventObj)`: Emit an event synchronously (no middleware).
- `.emit(eventObj)`: Emit an event asynchronously (with middleware).
- `.on(event, listener)`: Register an event listener (supports wildcards).
- `.off(event, listener)`: Remove an event listener.
- `.once(event, listener)`: Register a one-time event listener.

---

## Types

- `AukEvents`: The global event map interface (augmentable via module augmentation).
- `EventPayload<E>`: Type helper to get the payload type for an event.
- `AukPlugin` / `AukModule`: Plugin/module registration types (named or function).
- `PluginFn` / `ModuleFn`: Plugin/module function signatures.
- `AukContext`: Context object passed to plugins and modules (logger, config, health, etc).
- `AukConfig`: Configuration object for Auk service.
- `AukEvent`: Represents an event object for AukBus.
- `MiddlewareFn`: Middleware function signature for event processing.
- `CleanupFn`: Cleanup function signature for graceful shutdown.
- `HealthStatus`: Health check status object.
- `ProducerHandler`: Handler function for producers with optional `ctx` and `emit` parameters that are automatically injected by Auk.
- `ProducerFn`: Producer function signature for event generators.

---

## TypeBox Re-exports

Auk re-exports TypeBox types and helpers for schema-based event typing:

```typescript
import { Type, Static, TSchema } from "auk";
```

---

## Usage Notes

- **Type Safety**: Use `defineEvent` and module augmentation for global, type-safe event registration.
- **Producers/Consumers**: Use `createProducer`/`createConsumer` for ergonomic, type-safe event logic.
- **Plugins**: Use for connecting to event sources (queues, cron, webhooks, etc). Emit events via the bus or producers.
- **Modules**: Use for business logic. Subscribe to events via the bus or consumers.
- **Webhook Ingestion**: Use `aukWebhookHandler` for safe, type-checked external event ingestion.
- **Context**: Shared object for logger, config, health, and any custom fields.
- **Graceful Shutdown**: Register cleanup handlers for resource cleanup.

For more details and examples, see the [Usage Guide](../examples/USAGE.md).
