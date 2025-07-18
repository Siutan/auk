# Auk: Event-Driven Background Job Library for BunJS

_Auk_ is a lightweight, modular, event-driven background job framework for BunJS. Inspired by the resilient Arctic seabird, Auk is designed for concurrency, resilience, and developer ergonomics—making it easy to compose, scale, and maintain consumer services for queues, events, and background workflows.

---

## Key Features

- **Express-style chaining API** for plugin and module registration
- **Built-in event bus** for pub/sub between plugins and modules
- **BunJS-native**, fully ESM, minimal dependencies
- **Horizontal scaling ready:** Stateless, safe for many instances
- **Separation of concerns:** Plugins handle event sources, modules encapsulate logic
- **Friendly logging and error reporting**
- **Auto-context propagation:** All parts get shared config/logger/db

---

## Auk Concepts

- **Plugin:** Handles listening/watching for new work—queues, DB changes, cron, etc. Emits events.
- **Module:** Handles business logic—subscribes to events and processes jobs/tasks.
- **Event Bus:** Central emitter. Plugins fire events; modules subscribe and act.
- **App Context:** Shared dependencies/config for all parts (logger, db, config, etc).

---

## Usage Example

```ts
import { Auk } from "auk";

// Example plugin: emits an event every 5 seconds
const timerPlugin = async (context, bus) => {
  setInterval(() => {
    bus.emit("timer.tick", { timestamp: Date.now() });
  }, 5000);
};

// Example module: logs timer events
const loggerModule = (bus, context) => {
  bus.on("timer.tick", (data) => {
    context.logger.info("Timer ticked at", new Date(data.timestamp));
  });
};

const logger = {
  info: (...args) => console.log("[INFO]", ...args),
  warn: (...args) => console.warn("[WARN]", ...args),
  error: (...args) => console.error("[ERROR]", ...args),
  debug: (...args) => console.debug("[DEBUG]", ...args),
};

const app = new Auk({ logger, db: {}, config: {} })
  .plugins(timerPlugin)
  .modules(loggerModule);

app.start();
```

---

## API Overview

### `Auk` Class

- `constructor(context)` — Accepts a context object (logger, db, config, etc)
- `.plugins(...pluginFns)` — Register one or more plugins
- `.modules(...moduleFns)` — Register one or more modules
- `.start()` — Starts all plugins and modules

### Plugin Signature

```ts
type AukPlugin = (
  context: AukContext,
  bus: EventEmitter
) => Promise<void> | void;
```

- Use plugins to connect to queues, cron, webhooks, etc. and emit events.

### Module Signature

```ts
type AukModule = (bus: EventEmitter, context: AukContext) => void;
```

- Use modules to subscribe to events and implement business logic.

### Context

- The context object is shared with all plugins and modules. Add your own properties as needed (e.g., logger, db, config).

---

## Best Practices

- **Keep plugins stateless** and external-connection aware; support graceful shutdown if possible.
- **Modules should handle errors** and avoid crashing the process.
- **Use descriptive event names** to avoid collisions (e.g. `user.created`, `job.completed`).
- **Leverage BunJS features:** Fast startup, built-in ESM, native async/await.
- **Test modules/plugins independently** by passing a mock bus/context.

---

## Extending Auk

- Add more plugins for other sources (e.g. message queues, cron, webhooks).
- Add more modules for new business workflows.
- Compose with `.plugins()` and `.modules()` as needed.

---

## License

MIT
