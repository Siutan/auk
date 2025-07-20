import { Auk, type AukBus, type AukContext, Type } from "../src/index.js";

// === Typed Plugin Demo ===
// This demonstrates how context, bus, and data are properly typed

// Create base app with user events
const userApp = new Auk({
  config: { env: "development", serviceName: "typed-demo" },
}).event(
  "user.created",
  Type.Object({
    id: Type.String(),
    name: Type.String(),
    email: Type.String(),
  })
);

// Plugin with proper typing - this is the key improvement!
const notificationPlugin = {
  name: "notification-plugin",
  events: {
    "notification.sent": Type.Object({
      recipient: Type.String(),
      type: Type.String(),
      timestamp: Type.Number(),
    }),
  },
  fn: async (
    context: AukContext, // ✅ Properly typed context
    bus: AukBus<any> // ✅ Properly typed bus
  ) => {
    // ✅ context is fully typed with logger, config, etc.
    context.logger.info("🔔 Notification plugin initializing...");

    // ✅ data is properly typed based on event schema
    bus.on(
      "user.created",
      (data: { id: string; name: string; email: string }) => {
        context.logger.info(
          `📧 Sending welcome email to ${data.name} (${data.email})`
        );

        // Emit notification event with proper typing
        bus.emit({
          event: "notification.sent",
          data: {
            recipient: data.email,
            type: "welcome_email",
            timestamp: Date.now(),
          },
        });
      }
    );

    // ✅ data is properly typed for plugin's own events
    bus.on(
      "notification.sent",
      (data: { recipient: string; type: string; timestamp: number }) => {
        context.logger.info(
          `✅ Notification sent: ${data.type} to ${
            data.recipient
          } at ${new Date(data.timestamp).toISOString()}`
        );
      }
    );
  },
};

// Regular plugin for comparison
const analyticsPlugin = {
  name: "analytics-plugin",
  fn: async (
    context: AukContext, // ✅ Properly typed context
    bus: AukBus<any> // ✅ Properly typed bus
  ) => {
    context.logger.info("📊 Analytics plugin initializing...");

    // ✅ data is properly typed even in regular plugins
    bus.on(
      "user.created",
      (data: { id: string; name: string; email: string }) => {
        context.logger.info(`📈 Tracking user creation: ${data.id}`);
      }
    );
  },
};

// Compose with unified .plugins() method
const app = userApp.plugins(
  notificationPlugin, // Plugin with events - auto-detected
  analyticsPlugin // Regular plugin
);

async function runTypedDemo() {
  console.log("🚀 Starting typed plugin demo...\n");

  await app.startNonBlocking();

  // Create a user - this will trigger both plugins with proper typing
  await app.eventBus.emit({
    event: "user.created",
    data: {
      id: "user123",
      name: "Alice Johnson",
      email: "alice@example.com",
    },
  });

  await new Promise((resolve) => setTimeout(resolve, 100));

  console.log("\n✅ Demo completed! All events were properly typed.");

  await app.stop();
}

// Run the demo
runTypedDemo().catch(console.error);
