import { Auk, Type, ProducerHandler, AukContext, Static } from "../src";

// Define event schemas with TypeBox
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

// Define a custom producer function with correct typing
function messageQueueProducer<EventName extends keyof typeof Events>(
  eventName: EventName,
  opts: {
    handler: ProducerHandler<(typeof Events)[EventName], AukContext>;
  }
) {
  // Demo implementation: simulate producing an event to a message queue
  console.info(`[Demo MQ] Producing event: ${String(eventName)}`);

  const randomId = Math.floor(Math.random() * 1000000);
  // Create mock payload that matches the schema
  const mockPayload: Static<(typeof Events)[EventName]> =
    eventName === "user.created"
      ? { id: `user-${randomId}`, name: "John Doe", email: "john@example.com" }
      : { orderId: randomId, userId: `user-${randomId}`, amount: 99.99 };

  // these get injected by the middleware so just send anything
  const ctx = {} as any;
  const emit = () => {};

  opts.handler({ payload: mockPayload, ctx, emit });
}

// Create Auk instance with events
const auk = new Auk(Events, {
  config: { env: "development" },
});

// Register the producer
const typedAuk = auk.registerProducer(
  "messageQueueProducer",
  messageQueueProducer
);

// Get typed methods
const app = typedAuk.asMethods();

// Use with type safety - now we can omit ctx and emit parameters
app.messageQueueProducer("order.processed", {
  handler: ({ payload }) => {
    // No need to specify ctx and emit if not used
    console.log(`Processing order ${payload.orderId} for user ${payload.userId}`);
  },
});

// We can still use ctx and emit if needed
app.messageQueueProducer("user.created", {
  handler: ({ payload, ctx, emit }) => {
    // With the new ProducerHandler type, TypeScript correctly infers that ctx and
    // emit are present, so no non-null assertions are needed.
    ctx.logger.info(`User ${payload.name} created with email ${payload.email}`);

    // Emit another event
    emit("order.processed", {
      orderId: Math.floor(Math.random() * 1000000),
      userId: payload.id,
      amount: 99.99,
    });
  },
});

// Register consumers with full type safety
auk.consumer("order.processed", (order, ctx) => {
  ctx.logger.info(`Order ${order.orderId} processed for user ${order.userId}`);
});

auk.consumer("user.created", (user, ctx) => {
  ctx.logger.info(`User ${user.name} created with email ${user.email}`);
});

auk.start();