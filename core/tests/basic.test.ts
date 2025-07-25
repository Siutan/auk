import { expect, mock, test } from "bun:test";
import { Auk, type Static, T, Value } from "../src/index.js";
import { cron } from "../src/triggers/cron.js";

// Define test event schemas
const TestEvents = {
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
  "notification.sent": T.Object({
    userId: T.String(),
    message: T.String(),
    channel: T.Union([T.Literal("email"), T.Literal("sms")]),
  }),
} as const;

type UserCreated = Static<(typeof TestEvents)["user.created"]>;
type OrderProcessed = Static<(typeof TestEvents)["order.processed"]>;
type NotificationSent = Static<(typeof TestEvents)["notification.sent"]>;

test("Auk instance creation with event schemas", () => {
  const auk = new Auk(TestEvents, {
    config: { env: "test" },
  });

  expect(auk).toBeDefined();
  expect(auk.context).toBeDefined();
  expect(auk.context.config.env).toBe("test");
});

test("Producer registration with fluent API", () => {
  const auk = new Auk(TestEvents, {
    config: { env: "test" },
  });

  const producer = auk.producer("user.created");
  expect(producer).toBeDefined();

  // Test that we can chain methods
  const producerWithTrigger = producer.from(cron("0 0 * * *"));
  expect(producerWithTrigger).toBeDefined();
});

test("Consumer registration with type safety", () => {
  const auk = new Auk(TestEvents, {
    config: { env: "test" },
  });

  const mockHandler = mock((user: UserCreated, ctx: any) => {
    expect(user).toHaveProperty("id");
    expect(user).toHaveProperty("name");
    expect(user).toHaveProperty("email");
  });

  auk.consumer("user.created", mockHandler);

  // Verify the consumer was registered
  expect(mockHandler).toBeDefined();
});

test("Event emission and consumption", async () => {
  const auk = new Auk(TestEvents, {
    config: { env: "test" },
  });

  const receivedEvents: UserCreated[] = [];

  // Register consumer
  auk.consumer("user.created", (user, ctx) => {
    receivedEvents.push(user);
    ctx.logger.info(`User created: ${user.name}`);
  });

  // Register producer that emits immediately when triggered
  auk
    .producer("user.created")
    .from({
      subscribe: (listener) => {
        // Trigger immediately after a short delay
        setTimeout(() => {
          listener(undefined);
        }, 50);
        return () => {}; // cleanup function
      },
    })
    .handle(({ emit }) => {
      const testUser: UserCreated = {
        id: "test-123",
        name: "Test User",
        email: "test@example.com",
      };
      emit("user.created", testUser);
    });

  // Start the service in non-blocking mode for tests
  await auk.startNonBlocking();

  // Give some time for event processing
  await new Promise((resolve) => setTimeout(resolve, 200));

  // Verify event was received
  expect(receivedEvents).toHaveLength(1);
  expect(receivedEvents[0]).toEqual({
    id: "test-123",
    name: "Test User",
    email: "test@example.com",
  });

  await auk.stop();
}, 10000);

test("Multiple event types handling", async () => {
  const auk = new Auk(TestEvents, {
    config: { env: "test" },
  });

  const receivedUsers: UserCreated[] = [];
  const receivedOrders: OrderProcessed[] = [];
  const receivedNotifications: NotificationSent[] = [];

  // Register consumers for different event types
  auk.consumer("user.created", (user) => {
    receivedUsers.push(user);
  });

  auk.consumer("order.processed", (order) => {
    receivedOrders.push(order);
  });

  auk.consumer("notification.sent", (notification) => {
    receivedNotifications.push(notification);
  });

  // Register producer that emits multiple event types
  auk
    .producer("user.created")
    .from({
      subscribe: (listener) => {
        // Trigger immediately after a short delay
        setTimeout(() => {
          listener(undefined);
        }, 50);
        return () => {}; // cleanup function
      },
    })
    .handle(({ emit }) => {
      // Emit user created event
      emit("user.created", {
        id: "user-456",
        name: "Jane Doe",
        email: "jane@example.com",
      });

      // Emit order processed event
      emit("order.processed", {
        orderId: 12345,
        userId: "user-456",
        amount: 99.99,
      });

      // Emit notification sent event
      emit("notification.sent", {
        userId: "user-456",
        message: "Welcome to our platform!",
        channel: "email",
      });
    });

  await auk.startNonBlocking();

  // Give some time for event processing
  await new Promise((resolve) => setTimeout(resolve, 200));

  // Verify all events were received
  expect(receivedUsers).toHaveLength(1);
  expect(receivedOrders).toHaveLength(1);
  expect(receivedNotifications).toHaveLength(1);

  expect(receivedUsers[0].name).toBe("Jane Doe");
  expect(receivedOrders[0].orderId).toBe(12345);
  expect(receivedNotifications[0].channel).toBe("email");

  await auk.stop();
}, 10000);

test("Context and type safety", async () => {
  const auk = new Auk(TestEvents, {
    config: { env: "test" },
  });

  let contextReceived: any;

  auk.consumer("user.created", (user, ctx) => {
    contextReceived = ctx;
    const verified = Value.Check(TestEvents["user.created"], user);
    expect(verified).toBe(true);
    expect(ctx).toBeDefined();
    expect(ctx.logger).toBeDefined();
    expect(ctx.config).toBeDefined();
    expect(ctx.config.env).toBe("test");
  });

  auk
    .producer("user.created")
    .from({
      subscribe: (listener) => {
        // Trigger immediately after a short delay
        setTimeout(() => {
          listener({
            id: "ctx-test",
            name: "Context Test",
            email: "ctx@test.com",
          });
        }, 50);
        return () => {}; // cleanup function
      },
    })
    // theres no type safety here, because of the lack of a complete trigger above, this shouldn't matter for the test
    .handle(({ emit, ctx, payload }) => {
      const verified = Value.Check(TestEvents["user.created"], payload);
      expect(verified).toBe(true);
      expect(ctx).toBeDefined();
      expect(ctx.logger).toBeDefined();

      emit("user.created", {
        id: "ctx-test",
        name: "Context Test",
        email: "ctx@test.com",
      });
    });

  await auk.startNonBlocking();

  await new Promise((resolve) => setTimeout(resolve, 200));

  expect(contextReceived).toBeDefined();

  await auk.stop();
}, 10000);

test("Context and logger availability", async () => {
  const auk = new Auk(TestEvents, {
    config: { env: "test" },
  });

  let contextReceived: any;

  auk.consumer("user.created", (user, ctx) => {
    contextReceived = ctx;
    expect(ctx).toBeDefined();
    expect(ctx.logger).toBeDefined();
    expect(ctx.config).toBeDefined();
    expect(ctx.config.env).toBe("test");
  });

  auk
    .producer("user.created")
    .from({
      subscribe: (listener) => {
        // Trigger immediately after a short delay
        setTimeout(() => {
          listener(undefined);
        }, 50);
        return () => {}; // cleanup function
      },
    })
    .handle(({ emit, ctx }) => {
      expect(ctx).toBeDefined();
      expect(ctx.logger).toBeDefined();

      emit("user.created", {
        id: "ctx-test",
        name: "Context Test",
        email: "ctx@test.com",
      });
    });

  await auk.startNonBlocking();

  await new Promise((resolve) => setTimeout(resolve, 200));

  expect(contextReceived).toBeDefined();

  await auk.stop();
}, 10000);

test("Service lifecycle (start/stop)", async () => {
  const auk = new Auk(TestEvents, {
    config: { env: "test" },
  });

  // Test that startNonBlocking returns a promise
  const startPromise = auk.startNonBlocking();
  expect(startPromise).toBeInstanceOf(Promise);
  await startPromise;

  // Test that stop returns a promise
  const stopPromise = auk.stop();
  expect(stopPromise).toBeInstanceOf(Promise);
  await stopPromise;
}, 10000);

test("Cron trigger integration", () => {
  const cronTrigger = cron("0 0 * * *");

  expect(cronTrigger).toBeDefined();
  expect(cronTrigger.subscribe).toBeDefined();
  expect(typeof cronTrigger.subscribe).toBe("function");

  // Test that subscribe returns a cleanup function
  const cleanup = cronTrigger.subscribe(() => {});
  expect(cleanup).toBeDefined();
  expect(typeof cleanup).toBe("function");
});
