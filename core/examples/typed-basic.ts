import { Auk, Type } from "../src";
import { defineEvent, createProducer, createConsumer } from "../src/events";

// Augment the global AukEvents interface
declare module "../src/events" {
  interface AukEvents {
    "user.created": typeof UserCreatedSchema.static;
    "order.processed": typeof OrderProcessedSchema.static;
  }
}

// Define event schemas and register them globally
const UserCreatedSchema = Type.Object({
  id: Type.String(),
  name: Type.String(),
  email: Type.String(),
});
defineEvent("user.created", UserCreatedSchema);

const OrderProcessedSchema = Type.Object({
  orderId: Type.Number(),
  userId: Type.String(),
  amount: Type.Number(),
});
defineEvent("order.processed", OrderProcessedSchema);

// For demo: define a minimal context type
// In real usage, use your actual context type
interface Ctx {
  logger: any;
}

// Producer using the new helper (type-safe)
const userProducer = createProducer<"user.created", typeof UserCreatedSchema.static, Ctx>(
  "user.created",
  async (payload, ctx) => {
    ctx.logger.info("Emitting user.created", payload);
    // payload is fully typed
  }
);

const orderProducer = createProducer<
  "order.processed",
  typeof OrderProcessedSchema.static,
  Ctx
>("order.processed", (payload, ctx) => {
  ctx.logger.info("Emitting order.processed", payload);
  // payload is fully typed
});

// Consumer using the new helper (type-safe)
const orderConsumer = createConsumer<
  "order.processed",
  typeof OrderProcessedSchema.static,
  Ctx
>("order.processed", (orderData, ctx) => {
  ctx.logger.info(
    `Order ${orderData.orderId} processed for user ${orderData.userId}`
  );
  ctx.logger.info(`Amount: $${orderData.amount.toFixed(2)}`);
});

const app = new Auk();

// Simulate plugin/module registration using the new helpers
app.plugins({
  name: "user-producer-plugin",
  fn: (bus, context: Ctx) => {
    userProducer.run(
      {
        id: "user123",
        name: "Alice Johnson",
        email: "alice@example.com",
      },
      context
    );
  },
});

app.plugins({
  name: "order-producer-plugin",
  fn: (bus, context) => {
    orderProducer.run(
      {
        orderId: 12345,
        userId: "user123",
        amount: 99.99,
      },
      context as Ctx
    );
  },
});

app.modules({
  name: "order-consumer-module",
  fn: (bus, context) => {
    bus.on("order.processed", (orderData) => {
      orderConsumer.handle(orderData, context as Ctx);
    });
  },
});

app.start();
