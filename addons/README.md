# Auk Addons

Addons for the Auk event system.

## Available Addons

### Distributed Addons

- **NATS** (`./nats`) - NATS broker implementation for distributed event handling using NATS as a message broker

## Usage

```typescript
// Import everything
import { NATS, NATSOptions } from "auk-addons";

// Import only NATS
import { NATS, NATSOptions } from "auk-addons/nats";
```

### Building

```bash
# Build all addons
bun run build

# Development mode with watch
bun run dev

# Clean build artifacts
bun run clean
```

## Development

When adding new addons:

1. Create your addon in the appropriate directory (e.g., `distributed/your-addon/`)
2. Export it from the main `index.ts` file
3. Add it to the `exports` field in `package.json`
4. Add a build script for the specific addon

### Example: Adding a Redis Addon

```typescript
// distributed/redis/index.ts
export class Redis implements Broker {
  // Implementation
}

// index.ts
export * from "./distributed/redis/index.js";

// build.ts - Add to the buildAddons function
const redis = await build({
  entrypoints: ["./distributed/redis/index.ts"],
  outdir: "./dist",
  target: "bun",
  format: "esm",
  minify: true,
  naming: "redis.js",
});
buildOutputs.push(redis);

// package.json exports
"./redis": {
  "import": "./dist/redis.js",
  "types": "./dist/redis.d.ts"
}
```

## Build Output

The build process creates:

- `dist/index.js` - Main bundle with all addons
- `dist/nats.js` - NATS-only bundle
- `dist/*.d.ts` - TypeScript declarations
- `dist/*.js.map` - Source maps
