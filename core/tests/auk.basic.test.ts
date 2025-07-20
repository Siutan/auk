/** biome-ignore-all lint/suspicious/noExplicitAny: <ignoring for test purposes> */

import { Auk, type AukConfig, getAukConfig } from "../src/index";

import {
  type AukEvent,
  type MiddlewareFn,
  type Static,
  Type,
} from "../src/index";

function createLogger(logs: string[] = []) {
  return {
    info: (...args: unknown[]) => logs.push(`[INFO] ${args.join(" ")}`),
    warn: (...args: unknown[]) => logs.push(`[WARN] ${args.join(" ")}`),
    error: (...args: unknown[]) => logs.push(`[ERROR] ${args.join(" ")}`),
    debug: (...args: unknown[]) => logs.push(`[DEBUG] ${args.join(" ")}`),
    logs,
  };
}

// Test schemas for type safety
const UserCreatedSchema = Type.Object({
  id: Type.Number(),
  email: Type.String(),
  name: Type.String(),
});

const OrderCreatedSchema = Type.Object({
  id: Type.Number(),
  userId: Type.Number(),
  total: Type.Number(),
  items: Type.Array(Type.String()),
});

type UserCreatedEvent = Static<typeof UserCreatedSchema>;
type OrderCreatedEvent = Static<typeof OrderCreatedSchema>;

function createTestLogger() {
  const logs: string[] = [];
  return {
    info: (...args: unknown[]) => logs.push(`[INFO] ${args.join(" ")}`),
    warn: (...args: unknown[]) => logs.push(`[WARN] ${args.join(" ")}`),
    error: (...args: unknown[]) => logs.push(`[ERROR] ${args.join(" ")}`),
    debug: (...args: unknown[]) => logs.push(`[DEBUG] ${args.join(" ")}`),
    logs,
  };
}

describe("Auk Main Functionality", () => {
  let auk: Auk;

  let logger: ReturnType<typeof createTestLogger>;
  let eventHistory: Array<{ event: string; data: any; timestamp: number }> = [];

  beforeEach(() => {
    logger = createTestLogger();
    eventHistory = [];
    auk = new Auk({
      config: { env: "test", serviceName: "comprehensive-test" },
      logger,
    });
  });

  afterEach(async () => {
    if (auk) {
      await auk.stop();
    }
  });

  afterEach(async () => {
    if (auk) {
      await auk.stop();
    }
  });

  it("registers plugins and modules, emits and receives events", async () => {
    const logs: string[] = [];
    const logger = createLogger(logs);
    const events: string[] = [];
    const config: AukConfig = { env: process.env.NODE_ENV || "test" };

    let pluginCalled = false;
    let moduleCalled = false;

    const testPlugin = async (_context: any, bus: any) => {
      pluginCalled = true;
      await bus.emit({ event: "test.event", data: { foo: "bar", count: 42 } });
    };
    const testModule = (bus: any, _context: any) => {
      bus.on("test.event", (data: any) => {
        moduleCalled = true;
        events.push(data.foo);
        expect(data.count).toBe(42);
      });
    };

    auk = new Auk({ config, logger });
    auk
      .plugins({ name: "testPlugin", fn: testPlugin })
      .modules({ name: "testModule", fn: testModule });

    await auk.startNonBlocking();

    // wait a tick to ensure plugins/modules run
    await new Promise((r) => setTimeout(r, 50));

    expect(pluginCalled).toBe(true);
    expect(moduleCalled).toBe(true);
    expect(events).toContain("bar");
    expect(getAukConfig().env).toEqual(process.env.NODE_ENV || "test");
    expect(getAukConfig().serviceName).toBe("auk-service");
    expect(logger.logs.some((l) => l.includes("Service"))).toBe(true);
  });

  it("supports wildcard event listeners", async () => {
    const logs: string[] = [];
    const logger = createLogger(logs);
    const config: AukConfig = { env: process.env.NODE_ENV || "test" };
    const db = { test: true };
    // Avoid possible 'received' undefined errors by capturing in closure
    const received = {
      exact: 0,
      star: 0,
      prefix: 0,
      suffix: 0,
      complex: 0,
    } as const;
    const eventsToEmit = [
      { event: "user.created", data: { id: 1 } },
      { event: "user.updated", data: { id: 1 } },
      { event: "order.created", data: { id: 2 } },
      { event: "user.123.updated", data: { id: 3 } },
    ];
    auk = new Auk({ config, logger, db });
    auk.modules({
      name: "wildcardModule",
      fn: (bus: any) => {
        // Capture 'received' in closure to avoid possible undefined errors
        bus.on("user.created", (_data: any) => {
          (received as any).exact++;
        });
        bus.on("*", (_data: any) => {
          (received as any).star++;
        });
        bus.on("user.*", (_data: any) => {
          (received as any).prefix++;
        });
        bus.on("*.created", (_data: any) => {
          (received as any).suffix++;
        });
        bus.on("user.*.updated", (_data: any) => {
          (received as any).complex++;
        });
      },
    });
    await auk.startNonBlocking();
    await new Promise((r) => setTimeout(r, 50));
    for (const e of eventsToEmit) {
      await auk.eventBus.emit(e);
    }
    // Wait for events to be processed
    await new Promise((r) => setTimeout(r, 50));

    // Table output (array of objects for console.table)
    const table = [
      {
        Listener: "exact",
        Expected: 1,
        Actual: received.exact,
        "% of Events": `${(
          (received.exact / eventsToEmit.length) *
          100
        ).toFixed(1)}%`,
      },
      {
        Listener: "*",
        Expected: 4,
        Actual: received.star,
        "% of Events": `${((received.star / eventsToEmit.length) * 100).toFixed(
          1
        )}%`,
      },
      {
        Listener: "user.*",
        Expected: 2,
        Actual: received.prefix,
        "% of Events": `${(
          (received.prefix / eventsToEmit.length) *
          100
        ).toFixed(1)}%`,
      },
      {
        Listener: "*.created",
        Expected: 2,
        Actual: received.suffix,
        "% of Events": `${(
          (received.suffix / eventsToEmit.length) *
          100
        ).toFixed(1)}%`,
      },
      {
        Listener: "user.*.updated",
        Expected: 1,
        Actual: received.complex,
        "% of Events": `${(
          (received.complex / eventsToEmit.length) *
          100
        ).toFixed(1)}%`,
      },
    ];
    console.log("Wildcard Listener Results:");
    console.table(table);
    // Assertions
    expect(received.exact).toBe(1);
    expect(received.star).toBe(4);
    expect(received.prefix).toBe(2);
    expect(received.suffix).toBe(2);
    expect(received.complex).toBe(1);
  });

  describe("Event System Core Functionality", () => {
    it("should handle a complete user registration workflow", async () => {
      const registrationSteps: string[] = [];

      // Define typed events
      const typedAuk = auk
        .event("user.created", UserCreatedSchema)
        .event("order.created", OrderCreatedSchema);

      // Email service module (listener)
      typedAuk.modules({
        name: "email-service",
        fn: (bus) => {
          bus.on("user.created", (userData: UserCreatedEvent) => {
            registrationSteps.push(`email-sent-to-${userData.email}`);
            eventHistory.push({
              event: "user.created",
              data: userData,
              timestamp: Date.now(),
            });
          });
        },
      });

      // Analytics module (listener)
      typedAuk.modules({
        name: "analytics-service",
        fn: (bus) => {
          bus.on("user.created", (userData: UserCreatedEvent) => {
            registrationSteps.push(`analytics-tracked-${userData.id}`);
          });
        },
      });

      // User registration plugin (emitter)
      typedAuk.plugins({
        name: "user-registration",
        fn: async (_context, bus) => {
          registrationSteps.push("registration-started");

          // Simulate user registration
          await bus.emit({
            event: "user.created",
            data: {
              id: 123,
              email: "test@example.com",
              name: "Test User",
            },
          });

          registrationSteps.push("registration-completed");
        },
      });

      await typedAuk.startNonBlocking();
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Verify the workflow executed correctly
      expect(registrationSteps).toEqual([
        "registration-started",
        "email-sent-to-test@example.com",
        "analytics-tracked-123",
        "registration-completed",
      ]);

      expect(eventHistory).toHaveLength(1);
      expect(eventHistory[0]?.event).toBe("user.created");
      expect(eventHistory[0]?.data.email).toBe("test@example.com");
    });

    it("should handle event processing with middleware transformations", async () => {
      const processedEvents: any[] = [];

      // Add audit middleware
      const auditMiddleware: MiddlewareFn = (event: AukEvent) => {
        return {
          ...event,
          data: {
            ...(event.data as Record<string, any>),
            auditTimestamp: Date.now(),
            auditUser: "system",
          },
        };
      };
      auk.middleware(auditMiddleware);

      // Add validation middleware
      const validationMiddleware: MiddlewareFn = (event: AukEvent) => {
        const data = event.data as Record<string, any>;
        if (!data.id) {
          throw new Error("Event data must have an id");
        }
        return event;
      };
      auk.middleware(validationMiddleware);

      auk.modules({
        name: "event-processor",
        fn: (bus) => {
          bus.on("test.event", (data) => {
            processedEvents.push(data);
          });
        },
      });

      auk.plugins({
        name: "event-emitter",
        fn: async (_context, bus) => {
          await bus.emit({
            event: "test.event",
            data: { id: 1, message: "hello" },
          });
        },
      });

      await auk.startNonBlocking();
      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(processedEvents).toHaveLength(1);
      expect(processedEvents[0].id).toBe(1);
      expect(processedEvents[0].message).toBe("hello");
      expect(processedEvents[0].auditTimestamp).toBeDefined();
      expect(processedEvents[0].auditUser).toBe("system");
    });

    it("should handle wildcard patterns for event routing", async () => {
      const routedEvents: Array<{ pattern: string; event: string; data: any }> =
        [];

      auk.modules({
        name: "event-router",
        fn: (bus) => {
          // Specific handlers
          bus.on("user.created", (data) => {
            routedEvents.push({
              pattern: "user.created",
              event: "user.created",
              data,
            });
          });

          // Wildcard handlers
          bus.on("user.*", (data) => {
            routedEvents.push({ pattern: "user.*", event: "user.*", data });
          });

          bus.on("*.created", (data) => {
            routedEvents.push({
              pattern: "*.created",
              event: "*.created",
              data,
            });
          });

          bus.on("*", (data) => {
            routedEvents.push({ pattern: "*", event: "*", data });
          });
        },
      });

      auk.plugins({
        name: "event-generator",
        fn: async (_context, bus) => {
          await bus.emit({ event: "user.created", data: { id: 1 } });
          await bus.emit({ event: "user.updated", data: { id: 2 } });
          await bus.emit({ event: "order.created", data: { id: 3 } });
        },
      });

      await auk.startNonBlocking();
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Verify routing patterns
      const userCreatedEvents = routedEvents.filter((e) => e.data.id === 1);
      expect(userCreatedEvents).toHaveLength(4); // exact + user.* + *.created + *

      const userUpdatedEvents = routedEvents.filter((e) => e.data.id === 2);
      expect(userUpdatedEvents).toHaveLength(2); // user.* + *

      const orderCreatedEvents = routedEvents.filter((e) => e.data.id === 3);
      expect(orderCreatedEvents).toHaveLength(2); // *.created + *
    });
  });

  describe("Error Handling and Resilience", () => {
    it("should handle plugin errors gracefully without stopping the service", async () => {
      const successfulEvents: string[] = [];

      auk.modules({
        name: "reliable-module",
        fn: (bus) => {
          bus.on("test.event", () => {
            successfulEvents.push("processed");
          });
        },
      });

      auk.plugins({
        name: "failing-plugin",
        fn: async (_context, _bus) => {
          throw new Error("Plugin failed");
        },
      });

      auk.plugins({
        name: "successful-plugin",
        fn: async (_context, bus) => {
          await bus.emit({ event: "test.event", data: { message: "success" } });
        },
      });

      try {
        await auk.startNonBlocking();
        await new Promise((resolve) => setTimeout(resolve, 50));
      } catch (_error) {
        // Ignore error
      }

      // The service should handle plugin errors gracefully
      expect(successfulEvents).toHaveLength(1);
      expect(logger.logs.some((log) => log.includes("successful-plugin"))).toBe(
        true
      );
    });

    it("should handle middleware errors properly", async () => {
      const processedEvents: any[] = [];
      let middlewareErrorCaught = false;

      const errorMiddleware: MiddlewareFn = (event: AukEvent) => {
        const data = event.data as Record<string, any>;
        if (data.shouldFail) {
          throw new Error("Middleware error");
        }
        return event;
      };
      auk.middleware(errorMiddleware);

      auk.modules({
        name: "event-handler",
        fn: (bus) => {
          bus.on("test.event", (data) => {
            processedEvents.push(data);
          });
        },
      });

      auk.plugins({
        name: "test-emitter",
        fn: async (_context, bus) => {
          // This should fail
          try {
            await bus.emit({
              event: "test.event",
              data: { shouldFail: true },
            });
          } catch (_error) {
            middlewareErrorCaught = true;
          }

          // This should succeed
          await bus.emit({
            event: "test.event",
            data: { shouldFail: false, message: "success" },
          });
        },
      });

      await auk.startNonBlocking();
      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(middlewareErrorCaught).toBe(true);
      expect(processedEvents).toHaveLength(1);
      expect(processedEvents[0].message).toBe("success");
    });
  });

  describe("Lifecycle and Resource Management", () => {
    it("should properly manage plugin/module lifecycles", async () => {
      const lifecycleEvents: string[] = [];
      const resources: { timers: NodeJS.Timeout[]; connections: any[] } = {
        timers: [],
        connections: [],
      };

      auk.plugins({
        name: "resource-manager",
        fn: async (context, bus) => {
          lifecycleEvents.push("plugin-started");

          // Simulate creating resources
          const timer = context.setInterval(() => {
            lifecycleEvents.push("timer-tick");
          }, 10);
          resources.timers.push(timer);

          // Register cleanup
          context.addCleanupHandler("resource-cleanup", () => {
            lifecycleEvents.push("resources-cleaned");
          });

          await bus.emit({
            event: "plugin.ready",
            data: { name: "resource-manager" },
          });
        },
      });

      auk.modules({
        name: "lifecycle-tracker",
        fn: (bus, context) => {
          lifecycleEvents.push("module-started");

          bus.on("plugin.ready", (data) => {
            lifecycleEvents.push(`plugin-ready-${data.name}`);
          });

          context.addCleanupHandler("module-cleanup", () => {
            lifecycleEvents.push("module-cleaned");
          });
        },
      });

      await auk.startNonBlocking();
      await new Promise((resolve) => setTimeout(resolve, 50));

      // Verify startup
      expect(lifecycleEvents).toContain("module-started");
      expect(lifecycleEvents).toContain("plugin-started");
      expect(lifecycleEvents).toContain("plugin-ready-resource-manager");

      // Verify cleanup on shutdown
      await auk.stop();
      expect(lifecycleEvents).toContain("resources-cleaned");
      expect(lifecycleEvents).toContain("module-cleaned");
    });

    it("should support health monitoring", () => {
      // Test health status management
      expect(auk.getHealthStatus().status).toBe("healthy");

      auk.updateHealthCheck("database", true);
      auk.updateHealthCheck("redis", true);
      expect(auk.getHealthStatus().status).toBe("healthy");
      expect(auk.getHealthStatus().checks.database).toBe(true);

      auk.updateHealthCheck("database", false);
      expect(auk.getHealthStatus().status).toBe("unhealthy");
      expect(auk.getHealthStatus().checks.database).toBe(false);
    });
  });

  describe("Performance and Scalability", () => {
    it("should handle high-frequency events efficiently", async () => {
      const eventCount = 1000;
      const processedEvents: number[] = [];
      const startTime = performance.now();

      auk.modules({
        name: "high-frequency-processor",
        fn: (bus) => {
          bus.on("performance.test", (data) => {
            processedEvents.push(data.id);
          });
        },
      });

      auk.plugins({
        name: "high-frequency-emitter",
        fn: async (_context, bus) => {
          const promises = [];
          for (let i = 0; i < eventCount; i++) {
            promises.push(
              bus.emit({
                event: "performance.test",
                data: { id: i },
              })
            );
          }
          await Promise.all(promises);
        },
      });

      await auk.startNonBlocking();
      await new Promise((resolve) => setTimeout(resolve, 200));

      const endTime = performance.now();
      const duration = endTime - startTime;

      expect(processedEvents).toHaveLength(eventCount);
      expect(duration).toBeLessThan(1000); // Should complete within 1 second
      console.log(`Processed ${eventCount} events in ${duration.toFixed(2)}ms`);
    });

    it("should handle concurrent event processing", async () => {
      const concurrentOperations = 50;
      const results: Array<{ id: number; timestamp: number }> = [];

      auk.modules({
        name: "concurrent-processor",
        fn: (bus) => {
          bus.on("concurrent.test", async (data) => {
            // Simulate async processing
            await new Promise((resolve) =>
              setTimeout(resolve, Math.random() * 10)
            );
            results.push({ id: data.id, timestamp: Date.now() });
          });
        },
      });

      auk.plugins({
        name: "concurrent-emitter",
        fn: async (_context, bus) => {
          const promises = [];
          for (let i = 0; i < concurrentOperations; i++) {
            promises.push(
              bus.emit({
                event: "concurrent.test",
                data: { id: i },
              })
            );
          }
          await Promise.all(promises);
        },
      });

      await auk.startNonBlocking();
      await new Promise((resolve) => setTimeout(resolve, 200));

      expect(results).toHaveLength(concurrentOperations);

      // Verify all operations completed
      const ids = results.map((r) => r.id).sort((a, b) => a - b);
      const expectedIds = Array.from(
        { length: concurrentOperations },
        (_, i) => i
      );
      expect(ids).toEqual(expectedIds);
    });
  });

  describe("Type Safety and Schema Validation", () => {
    it("should enforce type safety for defined events", async () => {
      const typedEvents: any[] = [];

      const typedAuk = auk
        .event("user.created", UserCreatedSchema)
        .event("order.created", OrderCreatedSchema);

      typedAuk.modules({
        name: "typed-handler",
        fn: (bus) => {
          bus.on("user.created", (userData: UserCreatedEvent) => {
            // TypeScript should enforce correct typing here
            typedEvents.push({
              type: "user",
              email: userData.email, // This should be type-safe
              id: userData.id,
            });
          });

          bus.on("order.created", (orderData: OrderCreatedEvent) => {
            // TypeScript should enforce correct typing here
            typedEvents.push({
              type: "order",
              total: orderData.total, // This should be type-safe
              items: orderData.items,
            });
          });
        },
      });

      typedAuk.plugins({
        name: "typed-emitter",
        fn: async (_context, bus) => {
          await bus.emit({
            event: "user.created",
            data: {
              id: 1,
              email: "test@example.com",
              name: "Test User",
            },
          });

          await bus.emit({
            event: "order.created",
            data: {
              id: 1,
              userId: 1,
              total: 99.99,
              items: ["item1", "item2"],
            },
          });
        },
      });

      await typedAuk.startNonBlocking();
      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(typedEvents).toHaveLength(2);
      expect(typedEvents[0].type).toBe("user");
      expect(typedEvents[0].email).toBe("test@example.com");
      expect(typedEvents[1].type).toBe("order");
      expect(typedEvents[1].total).toBe(99.99);
    });
  });
});
