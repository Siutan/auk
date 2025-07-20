import {
  Auk,
  type AukBus,
  type AukContext,
  type EventSchemasOf,
  type Module,
  type Plugin,
  Type,
} from "../src/index.js";

// === Modular App Architecture Demo ===
//
// This demo shows different approaches to creating typed plugins and modules:
//
// 1. For plugins that work with existing events (no new events):
//    const myPlugin: Plugin<EventSchemasOf<typeof app>> = { name: "...", fn: ... }
//
// 2. For plugins that define their own events:
//    const myPlugin = { name: "...", events: { ... }, fn: ... }
//
// 3. For modules (listeners only):
//    const myModule: Module<EventSchemasOf<typeof app>> = { name: "...", fn: ... }

// 1. Create separate app modules for different domains
const userService = new Auk({
  config: { env: "development", serviceName: "user-service" },
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
  )
  .modules({
    name: "user-handler",
    fn: (bus) => {
      bus.on("user.created", (data) => {
        console.log(`📧 Sending welcome email to ${data.name} (${data.email})`);
      });

      bus.on("user.updated", (data) => {
        console.log(`🔄 User ${data.id} profile updated`);
      });
    },
  });

// Example of how to create a typed plugin for the user service
const userAnalyticsPlugin: Plugin<EventSchemasOf<typeof userService>> = {
  name: "user-analytics-plugin",
  fn: async (context, bus) => {
    // context and bus are now properly typed!
    bus.on("user.created", (userData) => {
      // userData is properly typed as { id: string, name: string, email: string }
      context.logger.info(`Analytics: User ${userData.name} registered`);
    });

    bus.on("user.updated", (updateData) => {
      // updateData is properly typed as { id: string, changes: {} }
      context.logger.info(`Analytics: User ${updateData.id} updated`);
    });
  },
};

const orderService = new Auk({
  config: { env: "development", serviceName: "order-service" },
})
  .event(
    "order.placed",
    Type.Object({
      orderId: Type.String(),
      userId: Type.String(),
      total: Type.Number(),
    })
  )
  .event(
    "order.shipped",
    Type.Object({
      orderId: Type.String(),
      trackingNumber: Type.String(),
    })
  )
  .modules({
    name: "order-handler",
    fn: (bus) => {
      bus.on("order.placed", (data) => {
        console.log(`📦 Processing order ${data.orderId} for $${data.total}`);
      });

      bus.on("order.shipped", (data) => {
        console.log(`🚚 Order ${data.orderId} shipped: ${data.trackingNumber}`);
      });
    },
  });

// 2. Create a plugin with its own events
const notificationPlugin = {
  name: "notification-plugin",
  events: {
    "notification.email": Type.Object({
      to: Type.String(),
      subject: Type.String(),
      body: Type.String(),
    }),
    "notification.sms": Type.Object({
      phone: Type.String(),
      message: Type.String(),
    }),
  },
  fn: async (context: AukContext, bus: AukBus<any>) => {
    bus.on("notification.email", (data: any) => {
      console.log(`📬 Email sent to ${data.to}: ${data.subject}`);
    });

    bus.on("notification.sms", (data: any) => {
      console.log(`📱 SMS sent to ${data.phone}: ${data.message}`);
    });
  },
};

// 3. Compose everything together using .use() and unified .plugins()
const mainApp = userService
  .use(orderService) // Merge order functionality
  .plugins(
    notificationPlugin, // Plugin with events - automatically merges schemas
    userAnalyticsPlugin, // New typed plugin
    {
      name: "integration-plugin",
      fn: async (_context: AukContext, bus: AukBus<any>) => {
        // Cross-domain event handlers
        bus.on("user.created", async (userData: any) => {
          // Send notification when user is created
          await bus.emit({
            event: "notification.email",
            data: {
              to: userData.email,
              subject: "Welcome!",
              body: `Hi ${userData.name}, welcome to our platform!`,
            },
          });
        });

        bus.on("order.placed", async (orderData: any) => {
          // Send SMS notification when order is placed
          await bus.emit({
            event: "notification.sms",
            data: {
              phone: "+1234567890", // In real app, get from user
              message: `Order ${orderData.orderId} confirmed!`,
            },
          });
        });
      },
    }
  );

// 4. Example of creating a typed plugin for the fully composed app
const composedAppAnalytics: Plugin<EventSchemasOf<typeof mainApp>> = {
  name: "composed-app-analytics",
  fn: async (context, bus) => {
    // Now we have access to ALL events from user, order, and notification services!
    bus.on("user.created", (userData) => {
      context.logger.info(`📊 Analytics: New user ${userData.name}`);
    });

    bus.on("order.placed", (orderData) => {
      context.logger.info(`📊 Analytics: Order placed for $${orderData.total}`);
    });

    bus.on("notification.email", (emailData) => {
      context.logger.info(`📊 Analytics: Email sent to ${emailData.to}`);
    });

    bus.on("notification.sms", (smsData) => {
      context.logger.info(`📊 Analytics: SMS sent to ${smsData.phone}`);
    });
  },
};

// This plugin could be added to the main app
// mainApp.plugins(composedAppAnalytics);

// 4. Demo the composed functionality
async function runDemo() {
  console.log("🚀 Starting composed Auk application...\n");

  await mainApp.startNonBlocking();

  // Create a user
  console.log("👤 Creating user...");
  await mainApp.eventBus.emit({
    event: "user.created",
    data: {
      id: "user1",
      name: "Alice Johnson",
      email: "alice@example.com",
    },
  });

  await new Promise((resolve) => setTimeout(resolve, 100));

  // Place an order
  console.log("\n🛒 Placing order...");
  await mainApp.eventBus.emit({
    event: "order.placed",
    data: {
      orderId: "order1",
      userId: "user1",
      total: 99.99,
    },
  });

  await new Promise((resolve) => setTimeout(resolve, 100));

  // Ship the order
  console.log("\n📤 Shipping order...");
  await mainApp.eventBus.emit({
    event: "order.shipped",
    data: {
      orderId: "order1",
      trackingNumber: "TRK123456789",
    },
  });

  await new Promise((resolve) => setTimeout(resolve, 100));

  console.log(
    "\n✅ Demo completed! All events processed across composed services."
  );

  await mainApp.stop();
}

// Run the demo
runDemo().catch(console.error);
