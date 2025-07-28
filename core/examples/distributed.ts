import { NatsBroker } from "../../addons/src/distributed/nats/index.js";
import { Auk, T } from "../src/index.js";
import { cron } from "../src/triggers/cron.js";


const isProducer = process.argv.includes("--producer");

// Define event schemas
const Events = {
  "job.run": T.Object({
    jobId: T.String(),
    type: T.String(),
    payload: T.Any(),
  }),
  "metrics.update": T.Object({
    type: T.String(),
    value: T.Number(),
    timestamp: T.Number(),
  }),
} as const;

// Create NATS broker instance
const nats = new NatsBroker({
  servers: "nats://localhost:4222", // Default NATS server
  dlq: {
    enabled: true,
    maxDeliver: 3,
    streamSuffix: ".DLQ",
    autoCreateStreams: true,
  },
});

// Create Auk instance with distributed mode and NATS broker
const auk = new Auk(Events, {
  mode: "distributed",
  broker: nats,
  config: {
    env: "development",
    serviceName: "distributed-worker",
  },
});

if (isProducer) {
  auk
    .producer("job.run")
    .from(cron("*/10 * * * * *"))
    .withRetry({ max: 2 })
    .handle(async ({ ctx, emit }) => {
      ctx.logger.info("Running job");
      // simulate 10 jobs, each taking 3 seconds
      const jobs = Array.from({ length: 10 }, (_, i) => ({
        jobId: `job-${i + 1}`,
        type: "data-processing",
        payload: { data: `sample-data-${i + 1}` },
      }));

      for (const job of jobs) {
        emit("job.run", job);
      }
    });

  auk
    .producer("metrics.update")
    .from(cron("*/15 * * * * *"))
    .withRetry({ max: 2 })
    .handle(async ({ ctx, emit }) => {
      ctx.logger.info("Running metrics");
      // simulate 20 metrics, each taking 1 second
      const metrics = Array.from({ length: 20 }, () => ({
        type: "cpu_usage",
        value: Math.random() * 100,
        timestamp: Date.now(),
      }));

      for (const metric of metrics) {
        emit("metrics.update", metric);
      }
    });
}

auk.consumer(
  "job.run",
  (data, ctx) => {
    ctx.logger.info("Received job:", data);
  },
  { delivery: "queue" }
);

auk.consumer(
  "metrics.update",
  (data, ctx) => {
    ctx.logger.info("Received metrics:", data);
  },
  { delivery: "queue" }
);

// Start the application
console.log("Starting distributed Auk application...");
console.log("Make sure NATS server is running at nats://localhost:4222");
console.log("");
if (isProducer) {
  console.log("🏭 PRODUCER INSTANCE: This instance will emit jobs and metrics");
} else {
  console.log(
    "⚙️  WORKER INSTANCE: This instance will process jobs and collect metrics"
  );
}
console.log("");
console.log("To test distributed behavior:");
console.log("1. Run with 'bun run <file> --producer' for one instance");
console.log("2. Run with 'bun run <file>' for other instances");
console.log("3. Run multiple worker instances to see load balancing");
console.log("");

auk.start();
