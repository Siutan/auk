# Auk API Reference

This document describes the public API of the Auk library as defined in `src/index.ts`.

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

- `.event(eventName, schema)`: Define a typed event schema.
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

- `.event(eventName, schema)`: Register a typed event schema.
- `.middleware(fn)`: Register event middleware.
- `.emitSync(eventObj)`: Emit an event synchronously (no middleware).
- `.emit(eventObj)`: Emit an event asynchronously (with middleware).
- `.on(event, listener)`: Register an event listener (supports wildcards).
- `.off(event, listener)`: Remove an event listener.
- `.once(event, listener)`: Register a one-time event listener.

---

## Types

- `AukPlugin` / `AukModule`: Plugin/module registration types (named or function).
- `PluginFn` / `ModuleFn`: Plugin/module function signatures.
- `AukContext`: Context object passed to plugins and modules (logger, config, health, etc).
- `AukConfig`: Configuration object for Auk service.
- `AukEvent`: Represents an event object for AukBus.
- `MiddlewareFn`: Middleware function signature for event processing.
- `CleanupFn`: Cleanup function signature for graceful shutdown.
- `HealthStatus`: Health check status object.

---

## TypeBox Re-exports

Auk re-exports TypeBox types and helpers for schema-based event typing:

```typescript
import { Type, Static, TSchema } from "auk";
```

---

## Usage Notes

- **Type Safety**: Use `.event()` to define event schemas for type-safe plugins and modules.
- **Plugins**: Use for connecting to event sources (queues, cron, webhooks, etc). Emit events via the bus.
- **Modules**: Use for business logic. Subscribe to events via the bus.
- **Context**: Shared object for logger, config, health, and any custom fields.
- **Graceful Shutdown**: Register cleanup handlers for resource cleanup.

For more details and examples, see the [Usage Guide](../USAGE.md).
