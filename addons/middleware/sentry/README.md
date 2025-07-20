# Auk Addons

This directory contains optional middleware and integrations for Auk, such as distributed brokers, monitoring, and observability tools.

## Available Addons

### Sentry Middleware

**File:** `sentry-middleware.ts`

Capture errors in your Auk event pipeline and report them to Sentry.

**Install Sentry:**

```bash
bun add @sentry/bun
```

**Usage:**

```typescript
import { sentryMiddleware } from "@/addons/sentry-middleware";
auk.middleware(sentryMiddleware({ dsn: "https://...@sentry.io/123" }));
```

**Options:**


**What it does:**

- Captures any error thrown in the Auk middleware chain
- Attaches event name, event data, metadata, and environment as Sentry context
- Works in both Bun and Node.js environments

---

## Contributing

Feel free to add more middleware for popular tools (Datadog, Prometheus, OpenTelemetry, etc.) following this pattern!
