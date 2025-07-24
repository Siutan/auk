import { umqTrigger } from "../../addons/triggers/umq.js";
import { Auk, T } from "../src/index";

// 1. Define the MQ event schema
const OrderProcessedSchema = T.Object({
  orderId: T.String(),
  amount: T.Number(),
});

const CreateUserSchema = T.Object({
  id: T.String(),
  name: T.String(),
  email: T.String(),
});

const UpdateUserSchema = T.Object({
  id: T.String(),
  name: T.String(),
  email: T.String(),
  newEmail: T.String(),
});

const Events = {
  "order.processed": OrderProcessedSchema,
  "user.created": CreateUserSchema,
  "user.updated": UpdateUserSchema,
} as const;

// 2. Create Auk instance
const auk = new Auk(Events, {
  config: { env: "development" },
});

// 3. Register producer with MQ trigger
const umqConfig = {
  provider: "rabbitmq" as const,
  config: {
    url: "amqp://localhost:5672",
  },
};
auk
  .producer("order.processed")
  .from(umqTrigger(auk, umqConfig))
  .handle(async ({ payload, ctx, emit }) => {
    // payload is now properly typed as { orderId: string, amount: number }
    ctx.logger.info("Producing order.processed event", payload);

    emit("order.processed", payload);

    // Also create a user sometimes
    if (Number.parseInt(payload.orderId) % 3 === 0) {
      emit("user.created", {
        id: `user-${payload.orderId}`,
        name: "John Doe",
        email: `${payload.orderId}-${payload.amount}@example.com`,
      });
    }
  });

auk
  .producer("user.updated")
  .from(umqTrigger(auk, umqConfig))
  .handle(async ({ payload, ctx, emit }) => {
    ctx.logger.info("Producing user.updated event", payload);

    // simulate a database auth check
    auk.context.logger.info("Checking if user is authenticated...");
    await new Promise((resolve) => setTimeout(resolve, 1000));
    auk.context.logger.info("User is authenticated!");

    emit("user.updated", payload);
  });

// 4. Register consumers with full type safety
auk.consumer("order.processed", (order, ctx) => {
  // order is typed as { orderId: number, userId: string, amount: number }
  ctx.logger.info(`Order ${order.orderId} processed for $${order.amount}`);
});

auk.consumer("user.created", (user, ctx) => {
  // user is typed as { id: string, name: string, email: string }
  ctx.logger.info(`User ${user.id} created: ${user.name} (${user.email})`);
});

// 5. Start the service
console.log("Starting Auk service with MQ plugin...");
auk.start();
