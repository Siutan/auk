import { Auk, Type } from "../src/index.js";

/**
 * Fluent Typing Demo
 *
 * This example demonstrates the improved DX for type-safe event registration.
 * Always chain .event() calls or assign the result to get full type safety!
 */

// ✅ CORRECT: Chain .event() calls for full type safety
const app = new Auk({ config: { env: "development" } })
  .event(
    "user.created",
    Type.Object({
      id: Type.String(),
      email: Type.String(),
      name: Type.String(),
    })
  )
  .event(
    "user.updated",
    Type.Object({
      id: Type.String(),
      email: Type.Optional(Type.String()),
      name: Type.Optional(Type.String()),
    })
  )
  .event(
    "user.deleted",
    Type.Object({
      id: Type.String(),
    })
  );

// ✅ CORRECT: Assign the result to a new variable
const baseApp = new Auk({ config: { env: "development" } });
const typedApp = baseApp
  .event(
    "order.placed",
    Type.Object({
      orderId: Type.String(),
      userId: Type.String(),
      amount: Type.Number(),
    })
  )
  .event(
    "order.cancelled",
    Type.Object({
      orderId: Type.String(),
      reason: Type.String(),
    })
  );

// Now we have full type safety!
app.eventBus.on("user.created", (data) => {
  // data is fully typed: { id: string, email: string, name: string }
  console.log(`User created: ${data.name} (${data.email})`);
});

typedApp.eventBus.on("order.placed", (data) => {
  // data is fully typed: { orderId: string, userId: string, amount: number }
  console.log(`Order placed: ${data.orderId} for $${data.amount}`);
});

// ❌ WRONG: Don't do this - you'll lose type safety!
// const wrongApp = new Auk({ config: { env: "development" } });
// wrongApp.event("some.event", Type.Object({ data: Type.String() })); // Types are lost!

async function demo() {
  console.log("🎯 Fluent Typing Demo");

  // Set up listeners with full type safety
  app.eventBus.on("user.updated", (data) => {
    console.log(`User ${data.id} updated:`, data);
  });

  typedApp.eventBus.on("order.cancelled", (data) => {
    console.log(`Order ${data.orderId} cancelled: ${data.reason}`);
  });

  // Emit events with type safety
  await app.eventBus.emit({
    event: "user.created",
    data: {
      id: "123",
      email: "john@example.com",
      name: "John Doe",
    },
  });

  await app.eventBus.emit({
    event: "user.updated",
    data: {
      id: "123",
      email: "john.doe@example.com", // Optional field
    },
  });

  await typedApp.eventBus.emit({
    event: "order.placed",
    data: {
      orderId: "order-456",
      userId: "123",
      amount: 99.99,
    },
  });

  await typedApp.eventBus.emit({
    event: "order.cancelled",
    data: {
      orderId: "order-456",
      reason: "Customer request",
    },
  });

  console.log("✅ All events emitted with full type safety!");
}

// Run the demo
if (import.meta.main) {
  demo().catch(console.error);
}
