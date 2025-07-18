import { Auk, Type } from "../src";

// Define event schemas
const UserCreatedSchema = Type.Object({
  id: Type.String(),
  name: Type.String(),
  email: Type.String(),
});

const OrderProcessedSchema = Type.Object({
  orderId: Type.Number(),
  userId: Type.String(),
  amount: Type.Number(),
});

// Create typed app with event schemas
const app = new Auk()
  .event("user.created", UserCreatedSchema)
  .event("order.processed", OrderProcessedSchema);

app.plugins({
  name: "user-plugin",
  fn: async (context, bus) => {
    context.logger.info("User plugin started");

    // TypeScript will enforce the correct data type here
    bus.emitSync({
      event: "user.created",
      data: {
        id: "user123",
        name: "Alice Johnson",
        email: "alice@example.com",
      },
    });

    // This would cause a TypeScript error:
    // bus.emitSync({
    //   event: "user.created",
    //   data: { invalid: "data" }
    // });
  },
});

app.plugins({
  name: "order-plugin",
  fn: async (context, bus) => {
    context.logger.info("Order plugin started");

    // TypeScript will enforce the correct data type here
    bus.emitSync({
      event: "order.processed",
      data: {
        orderId: 12345,
        userId: "user123",
        amount: 99.99,
      },
    });
  },
});

app.modules({
  name: "user-module",
  fn: (bus, context) => {
    // TypeScript infers the correct type for userData
    bus.on("user.created", (userData) => {
      // userData is typed as { id: string; name: string; email: string; }
      context.logger.info(
        `New user created: ${userData.name} (${userData.email})`
      );
      context.logger.info(`User ID: ${userData.id}`);
    });
  },
});

app.modules({
  name: "order-module",
  fn: (bus, context) => {
    // TypeScript infers the correct type for orderData
    bus.on("order.processed", (orderData) => {
      // orderData is typed as { orderId: number; userId: string; amount: number; }
      context.logger.info(
        `Order ${orderData.orderId} processed for user ${orderData.userId}`
      );
      context.logger.info(`Amount: $${orderData.amount.toFixed(2)}`);
    });
  },
});

app.modules({
  name: "analytics-module",
  fn: (bus, context) => {
    // For untyped events, fallback to 'any'
    bus.on("unknown.event", (data) => {
      // data is 'any' type here
      context.logger.info("Unknown event received:", data);
    });
  },
});

app.start().then(() => {
  console.log("Typed application started!");
});
