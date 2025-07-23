import { Auk, cron, type MQClient, mqListener, T } from "../src";

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
  "email.send": T.Object({
    userId: T.String(),
    template: T.String(),
  }),
} as const;

// 2. Create Auk instance with events
const auk = new Auk(Events, {
  config: { env: "development" },
});

// 3. Register consumers with full type safety
auk.consumer("order.processed", (order, ctx) => {
  // order is typed as { orderId: number, userId: string, amount: number }
  ctx.logger.info(`Order ${order.orderId} processed for user ${order.userId}`);
});

auk.consumer("user.created", (user, ctx) => {
  // user is typed as { id: string, name: string, email: string }
  ctx.logger.info(`User ${user.name} created with email ${user.email}`);
});

auk.consumer("email.send", (email, ctx) => {
  // email is typed as { userId: string, template: string }
  ctx.logger.info(`Sending ${email.template} email to user ${email.userId}`);
});

// 4. Register producers using the new fluent API

// Example 1: Cron-based producer
auk
  .producer("email.send")
  .from(cron("0 9 * * *")) // Daily at 9 AM (demo: every 10 seconds)
  .withRetry({ max: 2 })
  .handle(async ({ ctx, emit }) => {
    ctx.logger.info("Running daily email job");

    // Simulate getting pending emails from database
    const pendingEmails = [
      { userId: "user-1", template: "welcome" },
      { userId: "user-2", template: "newsletter" },
    ];

    for (const email of pendingEmails) {
      emit("email.send", email);
    }
  });

// Example 2: Message Queue producer (with mock MQ client)
const mockMQClient: MQClient<{
  orderId: number;
  userId: string;
  amount: number;
}> = {
  consume(queue: string, onMessage: (msg: any) => void) {
    console.log(`[Mock MQ] Listening to queue: ${queue}`);

    // Simulate receiving messages every 5 seconds
    setInterval(() => {
      const mockOrder = {
        orderId: Math.floor(Math.random() * 1000),
        userId: `user-${Math.floor(Math.random() * 100)}`,
        amount: Math.round(Math.random() * 1000 * 100) / 100,
      };
      onMessage(mockOrder);
    }, 5000);
  },
};

auk
  .producer("order.processed")
  .from(mqListener("orders", mockMQClient))
  .handle(async ({ payload, ctx, emit }) => {
    ctx.logger.info("Processing order from MQ", payload);

    // Validate and enrich the order data
    if (payload.amount > 0) {
      emit("order.processed", payload);

      // Maybe trigger user creation for new users
      if (payload.userId.includes("new")) {
        emit("user.created", {
          id: payload.userId,
          name: "New User",
          email: `${payload.userId}@example.com`,
        });
      }
    }
  });

// Example 3: Modular producer registration
function emailProducers(auk: Auk<typeof Events>) {
  auk
    .producer("email.send")
    .from(cron("*/5 * * * *")) // Every 5 minutes
    .handle(async ({ ctx, emit }) => {
      ctx.logger.info("Checking for scheduled emails");
      // Implementation here
    });
}

function orderProducers(auk: Auk<typeof Events>) {
  // Another producer for orders
  auk
    .producer("order.processed")
    .from(cron("*/2 * * * *")) // Every 2 minutes
    .handle(async ({ ctx, emit }) => {
      ctx.logger.info("Processing batch orders");

      // Simulate batch processing
      const batchOrders = [
        { orderId: 1001, userId: "batch-user-1", amount: 99.99 },
        { orderId: 1002, userId: "batch-user-2", amount: 149.99 },
      ];

      for (const order of batchOrders) {
        emit("order.processed", order);
      }
    });
}

// 5. Use modular registration
auk.use(emailProducers).use(orderProducers);

// 6. Start the service
console.log("Starting Auk service with new producer API...");
auk.start();
