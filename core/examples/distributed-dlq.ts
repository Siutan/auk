import { type DLQConfig, NatsBroker } from "../../addons/distributed/nats/index.js";
import { Auk, createProducer, T as Type } from "../src/index.js";

// Example configuration with DLQ enabled
const dlqConfig: DLQConfig = {
  enabled: true,
  maxDeliver: 3, // Retry up to 3 times before sending to DLQ
  streamSuffix: ".DLQ", // DLQ streams will be named like "event.DLQ"
  consumerName: "auk-dlq-consumer",
  autoCreateStreams: true,
};

// Create NATS broker with DLQ support
const nats = new NatsBroker({
  servers: "nats://localhost:4222",
  dlq: dlqConfig, // Pass DLQ config to middleware
});

const Events = {
  orders: Type.Object({
    orderId: Type.String(),
    amount: Type.Number(),
  }),
} as const;

// Example event handler that might fail
async function processOrder(data: { orderId: string; amount: number }) {
  console.log(`[processOrder] Processing order: ${data.orderId}`);
  console.log(`Processing order: ${data.orderId}`);

  // Simulate a failure condition
  if (data.orderId === "FAILING_ORDER") {
    console.log(`Order ${data.orderId} failed due to being a designated failing order.`);
    throw new Error("Order processing failed");
  }

    console.log(`[processOrder] Order ${data.orderId} processed successfully.`);
}

// Create Auk instance with distributed mode and NATS broker
const auk = new Auk(Events, {
  broker: nats,
  config: {
    env: "development",
    serviceName: "order-processor",
  },
})

const isProducer = process.argv.includes("--producer");

console.log("Starting distributed Auk application with DLQ...");
console.log("Make sure NATS server is running at nats://localhost:4222\n");

if (isProducer) {
  console.log("🏭 PRODUCER INSTANCE: This instance will emit orders that may fail.");
  auk.plugins({
    name: "order-emitter",
    fn: async (auk, context, bus) => {
      context.logger.info("Order emitter plugin loaded");

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

      // Emit a failing order
      bus.emit({
        event: "orders",
        data: {
          orderId: "FAILING_ORDER",
          amount: 999,
        },
      });

      context.logger.info("Finished emitting orders");
    },
  });

  
} else {
  console.log("⚙️  WORKER INSTANCE: This instance will process orders and handle failures with DLQ.");
  // Register a consumer that listens to orders
  auk.consumer("orders", async (data, { logger }) => {
    logger.info("[consumer] Received order:", data);
    // DLQ is automatically handled in the background by NATS middleware!
    logger.info("Processing order:", data);
    await processOrder(data);
  }, { delivery: "queue" });
}

// Start the service
console.log("Starting Auk service...");
auk.start();
