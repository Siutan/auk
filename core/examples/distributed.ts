import { NatsBroker } from "../../addons/distributed/nats/index.js";
import {
  Auk,
  type AukContext,
  type ProducerHandler,
  T as Type,
} from "../src/index.js";

const isProducer = process.argv.includes("--producer");

// Define event schemas
const Events = {
  "job.run": Type.Object({
    jobId: Type.String(),
    type: Type.String(),
    payload: Type.Any(),
  }),
  "metrics.update": Type.Object({
    type: Type.String(),
    value: Type.Number(),
    timestamp: Type.Number(),
  }),
} as const;

// Create NATS broker instance
const nats = new NatsBroker({
  servers: "nats://localhost:4222", // Default NATS server
});

// register producer functions
function jobProducer<EventName extends keyof typeof Events>(
  eventName: EventName,
  opts: {
    handler: ProducerHandler<(typeof Events)[EventName], AukContext>;
  }
) {
  // only run in the producer instance
  if (!isProducer) return;

  console.log(`[jobProducer] Producing event: ${String(eventName)}`);
  let jobCounter = 0;
  const interval = setInterval(() => {
    const jobId = `job-${++jobCounter}`;

    opts.handler({
      payload: {
        jobId,
        type: "data-processing",
        payload: { data: `sample-data-${jobCounter}` },
      },
      ctx: {} as AukContext,
      emit: () => {},
    });

    console.log(`[jobProducer] Emitted job: ${jobId}`);

    if (jobCounter >= 20) {
      clearInterval(interval);
      console.log("jobProducer finished");
    }
  }, 1000);
}

function metricsProducer<EventName extends keyof typeof Events>(
  eventName: EventName,
  opts: {
    handler: ProducerHandler<(typeof Events)[EventName], AukContext>;
  }
) {
  // only run in the producer instance
  if (!isProducer) return;

  console.log(`[metricsProducer] Producing event: ${String(eventName)}`);
  let metricsCounter = 0;
  const interval = setInterval(() => {
    const metricsId = `metrics-${++metricsCounter}`;
    opts.handler({
      payload: {
        type: "cpu_usage",
        value: Math.random() * 100,
        timestamp: Date.now(),
      },
      ctx: {} as AukContext,
      emit: () => {},
    });

    console.log(`[metricsProducer] Emitted metrics: ${metricsId}`);

    if (metricsCounter >= 20) {
      clearInterval(interval);
      console.log("metricsProducer finished");
    }
  }, 3000);
}

// Create Auk instance with the NATS broker
const aukService = new Auk(Events, {
  broker: nats,
  config: {
    env: "development",
    serviceName: "distributed-worker",
  },
})
  .registerProducer("jobProducer", jobProducer)
  .registerProducer("metricsProducer", metricsProducer);

const app = aukService.asMethods();

app.jobProducer("job.run", {
  handler: ({ payload, ctx, emit }) => {
    ctx.logger.info("Received job.run", payload);
    // Simulate job processing with auto-cleanup timeout
    emit("job.run", payload);
  },
});

app.metricsProducer("metrics.update", {
  handler: ({ payload, ctx, emit }) => {
    ctx.logger.info("Received metrics.update", payload);
    // Simulate job processing with auto-cleanup timeout
    emit("metrics.update", payload);
  },
});

aukService.consumer("job.run", (data, ctx) => {
  ctx.logger.info("Received job:", data);
});

aukService.consumer("metrics.update", (data, ctx) => {
  ctx.logger.info("Received metrics:", data);
});

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

aukService.start();
