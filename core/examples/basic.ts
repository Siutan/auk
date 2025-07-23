import { Auk, T } from "../src";
import { cron } from "../src/triggers/cron.js";

// 1. Define event schemas with TypeBox
const Events = {
  "user.created": T.Object({
    id: T.String(),
    name: T.String(),
    email: T.String(),
  }),
  "order.processed": T.Object({
    orderId: T.Number(),
    userId: T.String(),
    amount: T.Number(),
  }),
} as const;

// 2. Create Auk instance with events
const auk = new Auk(Events, {
  config: { env: "development" },
});

// 3. Register a producer using the new fluent API
// This is much simpler and more intuitive!
auk
  .producer("order.processed")
  .from(cron("*/5 * * * * *")) // Every 5 seconds for demo
  .handle(({ ctx, emit }) => {
    const randomId = Math.floor(Math.random() * 1000000);
    const mockOrder = {
      orderId: randomId,
      userId: `user-${randomId}`,
      amount: Math.round(Math.random() * 1000 * 100) / 100,
    };

    ctx.logger.info("Producing order.processed event", mockOrder);

    // Emit the event - fully type-safe!
    emit("order.processed", mockOrder);

    // Also create a user sometimes
    if (randomId % 3 === 0) {
      emit("user.created", {
        id: `user-${randomId}`,
        name: "John Doe",
        email: `user-${randomId}@example.com`,
      });
    }
  });

// 4. Register consumers with full type safety
auk.consumer("order.processed", (order, ctx) => {
  // order is typed as { orderId: number, userId: string, amount: number }
  ctx.logger.info(`Order ${order.orderId} processed for user ${order.userId}`);
});

auk.consumer("user.created", (user, ctx) => {
  // user is typed as { id: string, name: string, email: string }
  ctx.logger.info(`User ${user.name} created with email ${user.email}`);
});

// 5. Start the service
console.log("Starting Auk service...");
auk.start();
