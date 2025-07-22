import { Auk, Type, ProducerHandler, AukContext, Static } from "../src";

// 1. Define event schemas with TypeBox
const Events = {
  "user.created": Type.Object({
    id: Type.String(),
    name: Type.String(),
    email: Type.String(),
  }),
  "order.processed": Type.Object({
    orderId: Type.Number(),
    userId: Type.String(),
    amount: Type.Number(),
  }),
} as const;

// 2. Define a custom producer function with correct typing
function messageQueueProducer<EventName extends keyof typeof Events>(
  eventName: EventName,
  opts: {
    handler: ProducerHandler<(typeof Events)[EventName], AukContext>;
  }
) {
  // Demo implementation: simulate producing an event to a message queue
  console.info(`[Demo MQ] Producing event: ${String(eventName)}`);

  // Create mock payload that matches the schema
  const mockPayload: Static<(typeof Events)[EventName]> =
    eventName === "user.created"
      ? { id: "user-123", name: "John Doe", email: "john@example.com" }
      : { orderId: 123, userId: "user-456", amount: 99.99 };

  opts.handler({ payload: mockPayload });
}

// 3. Create Auk instance with events
const auk = new Auk(Events, {
  config: { env: "development" },
});

// 4. Register the producer
const typedAuk = auk.registerProducer(
  "messageQueueProducer",
  messageQueueProducer
);

// 5. Get typed methods
const app = typedAuk.asMethods();

// 6. Use with type safety
app.messageQueueProducer("order.processed", {
  handler: ({ payload, ctx, emit }) => {
    ctx.logger.info("Received order.processed", payload);
    emit("order.processed", payload);

  },
});

// 7. Register consumers with full type safety
auk.consumer("order.processed", (order, ctx) => {
  // order is typed as { orderId: number, userId: string, amount: number }
  ctx.logger.info(`Order ${order.orderId} processed for user ${order.userId}`);
});

auk.consumer("user.created", (user, ctx) => {
  // user is typed as { id: string, name: string, email: string }
  ctx.logger.info(`User ${user.name} created with email ${user.email}`);
});


auk.start();
