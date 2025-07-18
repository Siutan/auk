# Auk: Event-Driven Background Job Library for BunJS

_Auk_ is a lightweight, modular, event-driven background job framework. Auk is designed for concurrency, resilience, and developer ergonomics—making it easy to compose, scale, and maintain consumer services for queues, events, and background workflows.

---

## Key Features

- **Event-Driven Architecture**: Plugins emit events, modules subscribe and process
- **Modular Design**: Easy to add new plugins and modules
- **Shared Context**: Logger, database, and config available to all components
- **Error Handling**: Graceful error handling with proper logging
- **Inter-Module Communication**: Modules can communicate via the event bus
- **BunJS Native**: Leverages Bun's performance and ESM support
- **Type Safety**: Full TypeScript support with schema-based event typing

---

## Quick Start

1. **Install dependencies** (requires [Bun](https://bun.sh/)):

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

you can find more examples in the [examples](./examples) folder.

```typescript
import { Auk, Type } from "auk";

// Define event schemas
const UserCreatedSchema = Type.Object({
  id: Type.String(),
  name: Type.String(),
  email: Type.String(),
});

// Create typed app
const app = new Auk().event("user.created", UserCreatedSchema);

// Plugin with type-safe emission
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

// Module with type-safe listening
app.modules({
  name: "user-module",
  fn: (bus, context) => {
    bus.on("user.created", (userData) => {
      context.logger.info(`New user: ${userData.name} (${userData.email})`);
    });
  },
});

app.start();
```

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
