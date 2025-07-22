import { natsMiddleware } from "../../addons/distributed/nats/index.js";
import { Auk, Type } from "../src/index.js";

// Define event schemas
const JobSchema = Type.Object({
  jobId: Type.String(),
  type: Type.String(),
  payload: Type.Any(),
});

const MetricsSchema = Type.Object({
  type: Type.String(),
  value: Type.Number(),
  timestamp: Type.Number(),
});

// Create NATS broker instance
const nats = natsMiddleware({
  servers: "nats://localhost:4222", // Default NATS server
});

// Create Auk instance in distributed mode
const app = new Auk({
  mode: "distributed",
  config: {
    env: "development",
    serviceName: "distributed-worker",
  },
});

app.middleware(nats);

// Simple role configuration - change this to true for the producer instance
const isProducer = false; // Change to true for one instance
if (isProducer) {
  // Producer plugin - emits jobs
  app.plugins({
    name: "job-producer",
    fn: async (context, bus) => {
      context.logger.info(
        "🏭 Job producer started (this instance will emit jobs)"
      );

      let jobCounter = 0;
      const interval = context.setInterval(() => {
        const jobId = `job-${++jobCounter}`;

        bus.emit({
          event: "job.run",
          data: {
            jobId,
            type: "data-processing",
            payload: { data: `sample-data-${jobCounter}` },
          },
        });

        context.logger.info(`📤 Emitted job: ${jobId}`);

        if (jobCounter >= 20) {
          clearInterval(interval);
          context.logger.info("🏁 Job producer finished");
        }
      }, 1000);
    },
    delivery: "queue", // Jobs should be load-balanced across workers
  });

  // Metrics plugin - emits metrics (only from producer instance)
  app.plugins({
    name: "metrics-producer",
    fn: async (context, bus) => {
      context.logger.info("📊 Metrics producer started");

      context.setInterval(() => {
        bus.emit({
          event: "metrics.update",
          data: {
            type: "cpu_usage",
            value: Math.random() * 100,
            timestamp: Date.now(),
          },
        });
      }, 3000);

      context.logger.info("📊 Metrics will be emitted every 3 seconds");
    },
    delivery: "broadcast", // Metrics should go to all subscribers
  });
}

// Worker module - processes jobs (runs on all instances)
app.modules({
  name: "job-worker",
  fn: (bus, context) => {
    context.logger.info("🔧 Job worker ready - will process jobs from queue");

    bus.on(
      "job.run",
      (jobData) => {
        context.logger.info(
          `🎯 Processing job: ${jobData.jobId} (${jobData.type})`
        );

        // Simulate job processing with auto-cleanup timeout
        context.setTimeout(() => {
          context.logger.info(`✅ Completed job: ${jobData.jobId}`);
        }, 800);
      },
      { delivery: "queue" }
    ); // Ensure jobs are load-balanced
  },
  delivery: "queue",
});

// Metrics collector module - collects metrics (runs on all instances)
app.modules({
  name: "metrics-collector",
  fn: (bus, context) => {
    context.logger.info(
      "📊 Metrics collector ready - will receive all metrics"
    );

    bus.on(
      "metrics.update",
      (metricsData) => {
        context.logger.info(
          `📈 Metrics: ${metricsData.type} = ${metricsData.value.toFixed(2)}%`
        );
      },
      { delivery: "broadcast" }
    ); // All instances should receive metrics
  },
  delivery: "broadcast",
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
console.log("1. Change isProducer to true in one instance");
console.log("2. Keep isProducer as false in other instances");
console.log("3. Run multiple instances to see load balancing");
console.log("");

app.start();
