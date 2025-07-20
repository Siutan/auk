import { describe, expect, test } from "bun:test";
import { Auk, type EventSchemasOf, type Plugin, Type } from "../src/index.js";

describe("Auk Composition System", () => {
  test("should compose two Auk instances using .use() method", async () => {
    const receivedEvents: any[] = [];

    // Create first Auk instance with user events
    const userApp = new Auk({
      config: { env: "test", serviceName: "user-service" },
    })
      .event(
        "user.created",
        Type.Object({ id: Type.String(), name: Type.String() })
      )
      .event(
        "user.updated",
        Type.Object({ id: Type.String(), changes: Type.Object({}) })
      );

    // Create second Auk instance with order events
    const orderApp = new Auk({
      config: { env: "test", serviceName: "order-service" },
    })
      .event(
        "order.placed",
        Type.Object({ orderId: Type.String(), userId: Type.String() })
      )
      .event(
        "order.shipped",
        Type.Object({ orderId: Type.String(), trackingNumber: Type.String() })
      );

    // Compose them together
    const composedApp = userApp.use(orderApp);

    // Add listeners for all event types
    composedApp.eventBus.on("user.created", (data) => {
      receivedEvents.push({ type: "user.created", data });
    });

    composedApp.eventBus.on("order.placed", (data) => {
      receivedEvents.push({ type: "order.placed", data });
    });

    // Test that all events work
    await composedApp.eventBus.emit({
      event: "user.created",
      data: { id: "user1", name: "John Doe" },
    });

    await composedApp.eventBus.emit({
      event: "order.placed",
      data: { orderId: "order1", userId: "user1" },
    });

    expect(receivedEvents).toHaveLength(2);
    expect(receivedEvents[0]).toEqual({
      type: "user.created",
      data: { id: "user1", name: "John Doe" },
    });
    expect(receivedEvents[1]).toEqual({
      type: "order.placed",
      data: { orderId: "order1", userId: "user1" },
    });

    await composedApp.stop();
  });

  test("should support plugins with events for modular event definitions", async () => {
    const receivedEvents: any[] = [];

    // Create base app
    const baseApp = new Auk({
      config: { env: "test", serviceName: "base-service" },
    }).event("app.started", Type.Object({ timestamp: Type.Number() }));

    // Define a plugin with its own events
    const authPlugin = {
      name: "auth-plugin",
      events: {
        "auth.login": Type.Object({
          userId: Type.String(),
          timestamp: Type.Number(),
        }),
        "auth.logout": Type.Object({ userId: Type.String() }),
      },
      fn: async (context: any, bus: any) => {
        // Plugin setup logic - context and bus are now properly typed
        bus.on("auth.login", (data: any) => {
          receivedEvents.push({ type: "auth.login", data });
        });
      },
    };

    // Add the plugin with events using unified .plugins() method
    const appWithAuth = baseApp.plugins(authPlugin);

    // Add a listener for base events
    appWithAuth.eventBus.on("app.started", (data) => {
      receivedEvents.push({ type: "app.started", data });
    });

    await appWithAuth.startNonBlocking();

    // Test events from both base app and plugin
    await appWithAuth.eventBus.emit({
      event: "app.started",
      data: { timestamp: Date.now() },
    });

    await appWithAuth.eventBus.emit({
      event: "auth.login",
      data: { userId: "user1", timestamp: Date.now() },
    });

    expect(receivedEvents).toHaveLength(2);
    expect(receivedEvents[0].type).toBe("app.started");
    expect(receivedEvents[1].type).toBe("auth.login");

    await appWithAuth.stop();
  });

  test("should maintain type safety across composition", async () => {
    // This test verifies that TypeScript compilation succeeds with proper types
    const app1 = new Auk().event(
      "typed.event",
      Type.Object({ message: Type.String() })
    );

    const app2 = new Auk().event(
      "another.event",
      Type.Object({ count: Type.Number() })
    );

    const composed = app1.use(app2);

    // These should all compile without TypeScript errors
    composed.eventBus.on("typed.event", (data) => {
      // TypeScript should infer data as { message: string }
      expect(typeof data.message).toBe("string");
    });

    composed.eventBus.on("another.event", (data) => {
      // TypeScript should infer data as { count: number }
      expect(typeof data.count).toBe("number");
    });

    await composed.eventBus.emit({
      event: "typed.event",
      data: { message: "hello" },
    });

    await composed.eventBus.emit({
      event: "another.event",
      data: { count: 42 },
    });

    await composed.stop();
  });

  test("should merge listeners from both instances", async () => {
    const events1: string[] = [];
    const events2: string[] = [];
    const composed: string[] = [];

    // Create first instance with listener
    const app1 = new Auk().event(
      "shared.event",
      Type.Object({ source: Type.String() })
    );

    app1.eventBus.on("shared.event", (data) => {
      events1.push(`app1-${data.source}`);
    });

    // Create second instance with listener for same event
    const app2 = new Auk().event(
      "shared.event",
      Type.Object({ source: Type.String() })
    );

    app2.eventBus.on("shared.event", (data) => {
      events2.push(`app2-${data.source}`);
    });

    // Compose them - should merge listeners
    const composedApp = app1.use(app2);

    composedApp.eventBus.on("shared.event", (data) => {
      composed.push(`composed-${data.source}`);
    });

    // Emit event - should trigger all merged listeners
    await composedApp.eventBus.emit({
      event: "shared.event",
      data: { source: "test" },
    });

    expect(events1).toContain("app1-test");
    expect(events2).toContain("app2-test");
    expect(composed).toContain("composed-test");

    await composedApp.stop();
  });

  test("should support typed plugins with EventSchemasOf", async () => {
    const receivedEvents: any[] = [];

    // Create a typed app
    const typedApp = new Auk({
      config: { env: "test", serviceName: "typed-test" },
    })
      .event(
        "user.created",
        Type.Object({
          id: Type.String(),
          name: Type.String(),
          email: Type.String(),
        })
      )
      .event(
        "user.updated",
        Type.Object({
          id: Type.String(),
          changes: Type.Object({}),
        })
      );

    // Create a typed plugin using EventSchemasOf
    const userPlugin: Plugin<EventSchemasOf<typeof typedApp>> = {
      name: "user-plugin",
      fn: async (context, bus) => {
        // context and bus are now properly typed!
        bus.on("user.created", (userData) => {
          // userData is typed as { id: string, name: string, email: string }
          receivedEvents.push({
            type: "user.created",
            data: userData,
            logged: `User ${userData.name} (${userData.email}) created`,
          });
        });

        bus.on("user.updated", (updateData) => {
          // updateData is typed as { id: string, changes: {} }
          receivedEvents.push({
            type: "user.updated",
            data: updateData,
            logged: `User ${updateData.id} updated`,
          });
        });
      },
    };

    // Add the typed plugin
    typedApp.plugins(userPlugin);

    await typedApp.startNonBlocking();

    // Test typed events
    await typedApp.eventBus.emit({
      event: "user.created",
      data: { id: "user1", name: "Alice", email: "alice@example.com" },
    });

    await typedApp.eventBus.emit({
      event: "user.updated",
      data: { id: "user1", changes: { name: "Alice Smith" } },
    });

    expect(receivedEvents).toHaveLength(2);
    expect(receivedEvents[0].type).toBe("user.created");
    expect(receivedEvents[0].logged).toBe(
      "User Alice (alice@example.com) created"
    );
    expect(receivedEvents[1].type).toBe("user.updated");
    expect(receivedEvents[1].logged).toBe("User user1 updated");

    await typedApp.stop();
  });
});
