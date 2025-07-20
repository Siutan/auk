import {
  type AdvancedMiddlewareFn,
  Auk,
  type AukEvent,
  circuitBreaker,
  compose,
  correlationId,
  logging,
  type MiddlewareFn,
  metrics,
  rateLimit,
  type Static,
  Type,
  timing,
  validation,
} from "../src/index";

// Define event schemas for type safety
const UserSchema = Type.Object({
  id: Type.Number(),
  name: Type.String(),
  email: Type.String(),
});

const OrderSchema = Type.Object({
  orderId: Type.String(),
  userId: Type.Number(),
  amount: Type.Number(),
  items: Type.Array(Type.String()),
});

type UserEvent = Static<typeof UserSchema>;
type OrderEvent = Static<typeof OrderSchema>;

// Create a custom logger that captures logs
const logs: Array<{ level: string; message: string; data?: any }> = [];
const customLogger = {
  debug: (message: string, data?: any) => {
    logs.push({ level: "debug", message, data });
    console.log(`🔍 [DEBUG] ${message}`, data || "");
  },
  info: (message: string, data?: any) => {
    logs.push({ level: "info", message, data });
    console.log(`ℹ️  [INFO] ${message}`, data || "");
  },
  warn: (message: string, data?: any) => {
    logs.push({ level: "warn", message, data });
    console.log(`⚠️  [WARN] ${message}`, data || "");
  },
  error: (message: string, data?: any) => {
    logs.push({ level: "error", message, data });
    console.log(`❌ [ERROR] ${message}`, data || "");
  },
};

// Create metrics collector
const metricsCollector = {
  storage: new Map<string, number>(),
  increment(metric: string, labels?: Record<string, string>) {
    const key = labels ? `${metric}:${JSON.stringify(labels)}` : metric;
    this.storage.set(key, (this.storage.get(key) || 0) + 1);
  },
  timing(metric: string, duration: number, labels?: Record<string, string>) {
    const key = labels
      ? `${metric}_duration:${JSON.stringify(labels)}`
      : `${metric}_duration`;
    this.storage.set(key, duration);
  },
  gauge(metric: string, value: number, labels?: Record<string, string>) {
    const key = labels ? `${metric}:${JSON.stringify(labels)}` : metric;
    this.storage.set(key, value);
  },
  getMetrics() {
    return Object.fromEntries(this.storage);
  },
};

console.log("🚀 Starting Auk Middleware Demo");

// Create Auk instance with typed events
const auk = new Auk({
  config: { env: "demo", serviceName: "middleware-demo" },
  logger: customLogger,
})
  .event("user.created", UserSchema)
  .event("order.created", OrderSchema);

// 1. Simple Middleware Example - adds processing timestamp
const timestampMiddleware: MiddlewareFn = (event: AukEvent) => {
  return {
    ...event,
    data: {
      ...(event.data as Record<string, any>),
      processedAt: new Date().toISOString(),
    },
  };
};

// 2. Advanced Middleware Example - request tracking
const requestTrackingMiddleware: AdvancedMiddlewareFn = async (
  event,
  context,
  next
) => {
  const start = performance.now();
  customLogger.info(`🏃 Processing ${event.event}...`);

  try {
    const result = await next();
    const duration = performance.now() - start;
    customLogger.info(
      `✅ Completed ${event.event} in ${duration.toFixed(2)}ms`
    );
    return result;
  } catch (error) {
    const duration = performance.now() - start;
    customLogger.error(
      `💥 Failed ${event.event} after ${duration.toFixed(2)}ms`,
      error
    );
    throw error;
  }
};

// 3. Custom Business Logic Middleware - adds business rules
const businessRulesMiddleware: AdvancedMiddlewareFn = async (
  event,
  context,
  next
) => {
  if (event.event === "order.created") {
    const data = event.data as Record<string, any>;

    // Business rule: orders over $1000 require approval
    if (data.amount > 1000) {
      customLogger.warn(`🔍 High value order detected: $${data.amount}`);
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

// Apply middleware in order (note: compose applies them in reverse order)
auk.middleware(timestampMiddleware);
auk.middleware(requestTrackingMiddleware);

// Apply common middleware
auk.middleware(correlationId({ header: "traceId" }));

auk.middleware(
  logging({
    level: "info",
    includeData: true,
    logger: customLogger,
    filter: (eventName) =>
      eventName.startsWith("user.") || eventName.startsWith("order."),
  })
);

auk.middleware(
  metrics({
    collector: metricsCollector,
    includeEventMetrics: true,
    includeTiming: true,
  })
);

auk.middleware(
  validation({
    validate: (data: any) => {
      // Basic validation - ensure required fields exist
      if (typeof data !== "object" || data === null) {
        return "Event data must be an object";
      }
      return true;
    },
    throwOnError: true,
  })
);

auk.middleware(businessRulesMiddleware);
auk.middleware(timing());

// Create modules (event listeners)
auk.modules({
  name: "user-service",
  fn: (bus) => {
    bus.on("user.created", (userData: UserEvent) => {
      customLogger.info(
        `👤 New user registered: ${userData.name} (${userData.email})`
      );

      // Simulate sending welcome email
      setTimeout(() => {
        customLogger.info(`📧 Welcome email sent to ${userData.email}`);
      }, 100);
    });
  },
});

auk.modules({
  name: "order-service",
  fn: (bus) => {
    bus.on("order.created", (orderData: OrderEvent) => {
      const typedData = orderData as any; // Cast to access middleware-added fields
      customLogger.info(
        `🛍️  New order: ${typedData.orderId} - $${typedData.amount}`
      );

      if (typedData.requiresApproval) {
        customLogger.warn(
          `⏳ Order ${typedData.orderId} requires approval: ${typedData.approvalReason}`
        );
      }

      if (typedData.traceId) {
        customLogger.info(`🔍 Order trace ID: ${typedData.traceId}`);
      }
    });
  },
});

auk.modules({
  name: "analytics-service",
  fn: (bus) => {
    // Listen to all events with wildcard
    bus.on("*", (data) => {
      customLogger.info(`📊 Analytics: Event tracked`);
    });
  },
});

// Create plugins (event emitters)
auk.plugins({
  name: "user-registration",
  fn: async (context, bus) => {
    customLogger.info("🏁 Starting user registration demo...");

    // Create some test users
    const users = [
      { id: 1, name: "Alice Johnson", email: "alice@example.com" },
      { id: 2, name: "Bob Smith", email: "bob@example.com" },
      { id: 3, name: "Carol Davis", email: "carol@example.com" },
    ];

    for (const user of users) {
      await bus.emit({
        event: "user.created",
        data: user,
      });

      // Small delay between users
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
  },
});

auk.plugins({
  name: "order-generator",
  fn: async (context, bus) => {
    customLogger.info("🛒 Starting order generation demo...");

    // Create some test orders
    const orders = [
      {
        orderId: "ORD-001",
        userId: 1,
        amount: 99.99,
        items: ["Widget A", "Widget B"],
      },
      {
        orderId: "ORD-002",
        userId: 2,
        amount: 1299.99,
        items: ["Premium Widget"],
      }, // High value order
      { orderId: "ORD-003", userId: 3, amount: 49.99, items: ["Basic Widget"] },
    ];

    for (const order of orders) {
      await bus.emit({
        event: "order.created",
        data: order,
      });

      // Small delay between orders
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  },
});

// Demonstrate error handling
auk.plugins({
  name: "error-demo",
  fn: async (context, bus) => {
    customLogger.info("💥 Testing error handling...");

    try {
      // This should fail validation
      await bus.emit({
        event: "user.created",
        data: null as any, // Invalid data
      });
    } catch (error) {
      customLogger.info(`✅ Validation caught invalid data: ${error}`);
    }
  },
});

// Start the demo
(async () => {
  await auk.startNonBlocking();

  // Wait for all events to process
  await new Promise((resolve) => setTimeout(resolve, 1000));

  // Show results
  console.log("\n📈 Metrics Report:");
  const collectedMetrics = metricsCollector.getMetrics();
  Object.entries(collectedMetrics).forEach(([key, value]) => {
    console.log(`  ${key}: ${value}`);
  });

  console.log("\n📋 Event Processing Summary:");
  console.log(`  Total log entries: ${logs.length}`);
  console.log(`  Info logs: ${logs.filter((l) => l.level === "info").length}`);
  console.log(
    `  Warning logs: ${logs.filter((l) => l.level === "warn").length}`
  );
  console.log(
    `  Error logs: ${logs.filter((l) => l.level === "error").length}`
  );

  // Check health status
  console.log("\n🏥 Health Status:", auk.getHealthStatus());

  console.log("\n✨ Demo completed! All middleware worked correctly.");
  console.log("🔧 Middleware used:");
  console.log("  - Timestamp middleware (simple)");
  console.log("  - Request tracking middleware (advanced)");
  console.log("  - Correlation ID middleware");
  console.log("  - Logging middleware");
  console.log("  - Metrics middleware");
  console.log("  - Validation middleware");
  console.log("  - Business rules middleware");
  console.log("  - Timing middleware");

  await auk.stop();
})().catch(console.error);
