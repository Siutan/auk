import {
  type DLQConfig,
  natsMiddleware,
} from "../../addons/distributed/nats/index";
import { Auk, Type } from "../dist/index.js";

// Example configuration with DLQ enabled
const dlqConfig: DLQConfig = {
  enabled: true,
  maxDeliver: 3, // Retry up to 3 times before sending to DLQ
  streamSuffix: ".DLQ", // DLQ streams will be named like "event.DLQ"
  consumerName: "auk-dlq-consumer",
  autoCreateStreams: true,
};

// Create NATS broker with DLQ support
const nats = natsMiddleware({
  servers: "nats://localhost:4222",
  dlq: dlqConfig, // Pass DLQ config to middleware
});

// Example event handler that might fail
async function processOrder(data: { orderId: string; amount: number }) {
  console.log("Processing order:", data);

  // Simulate a failure condition
  if (data.orderId === "FAILING_ORDER") {
    throw new Error("Order processing failed");
  }

  console.log("Order processed successfully:", data.orderId);
}

// Create Auk instance with distributed mode and NATS broker
const auk = new Auk({
  config: {
    env: "development",
    serviceName: "order-processor",
  },
  mode: "distributed",
});

auk.middleware(nats);

// Define event schema for type safety
auk.event(
  "orders",
  Type.Object({
    orderId: Type.String(),
    amount: Type.Number(),
  })
);

auk.plugins({
  name: "order-processor",
  fn: async (context, bus) => {
    context.logger.info("Order processor plugin loaded");

    // emit events 10 times
    for (let i = 0; i < 10; i++) {
      bus.emit({
        event: "orders",
        data: {
          orderId: `SUCCESS_${String(i + 1).padStart(3, "0")}`,
          amount: 100,
        },
      });
    }
    context.logger.info("Order processor plugin loaded");
  },
});

// Register a module that listens to orders
auk.modules({
  name: "order-processor",
  fn: (bus, context) => {
    // Subscribe to orders - DLQ is automatically handled in the background by NATS middleware!
    bus.on("orders", processOrder, { delivery: "queue" });

    context.logger.info("Order processor module loaded");
  },
});

// Start the service
await auk.start();
