import { natsMiddleware } from "../../addons/distributed/nats/index";
import { Auk, Type } from "../src/index.js";

// Event schemas for different types of work
const EmailJobSchema = Type.Object({
  jobId: Type.String(),
  type: Type.Literal("email"),
  recipient: Type.String(),
  subject: Type.String(),
  template: Type.String(),
  priority: Type.Union([
    Type.Literal("low"),
    Type.Literal("normal"),
    Type.Literal("high"),
  ]),
});

const ImageJobSchema = Type.Object({
  jobId: Type.String(),
  type: Type.Literal("image"),
  imageUrl: Type.String(),
  operations: Type.Array(Type.String()),
  outputFormat: Type.String(),
});

const AnalyticsEventSchema = Type.Object({
  eventId: Type.String(),
  userId: Type.String(),
  action: Type.String(),
  timestamp: Type.Number(),
  metadata: Type.Record(Type.String(), Type.Any()),
});

const HealthStatusSchema = Type.Object({
  producerId: Type.String(),
  status: Type.Union([
    Type.Literal("healthy"),
    Type.Literal("degraded"),
    Type.Literal("down"),
  ]),
  timestamp: Type.Number(),
  metrics: Type.Object({
    jobsProduced: Type.Number(),
    avgLatency: Type.Number(),
    errorRate: Type.Number(),
  }),
});

// Create NATS broker
const nats = natsMiddleware({
  servers: "nats://localhost:4222",
});

// Get producer type from command line argument
const args = process.argv.slice(2);
const producerType =
  args.find((arg) => ["email", "image", "analytics"].includes(arg)) || "worker";
const producerId = `${producerType}-producer-${process.pid}`;

// Create Auk instance
const app = new Auk({
  mode: "distributed",
  config: {
    env: "development",
    serviceName: producerId,
  },
})

app.middleware(nats);

app
  .event("job.email", EmailJobSchema)
  .event("job.image", ImageJobSchema)
  .event("analytics.event", AnalyticsEventSchema)
  .event("health.status", HealthStatusSchema);

// Email Producer - High volume email jobs
if (producerType === "email") {
  app.plugins({
    name: "email-producer",
    fn: async (context, bus) => {
      context.logger.info("📧 Email producer started - generating email jobs");

      let emailCounter = 0;
      const emailTemplates = [
        "welcome",
        "newsletter",
        "notification",
        "reminder",
      ];
      const priorities: Array<"low" | "normal" | "high"> = [
        "low",
        "normal",
        "high",
      ];

      context.setInterval(() => {
        emailCounter++;
        const template =
          emailTemplates[Math.floor(Math.random() * emailTemplates.length)];
        const priority =
          priorities[Math.floor(Math.random() * priorities.length)];

        bus.emit({
          event: "job.email",
          data: {
            jobId: `email-${producerId}-${emailCounter}`,
            type: "email",
            recipient: `user${emailCounter}@example.com`,
            subject: `${template} email #${emailCounter}`,
            template,
            priority,
          },
        });

        context.logger.info(
          `📤 Email job ${emailCounter} (${priority} priority, ${template} template)`
        );

        if (emailCounter >= 50) {
          context.logger.info("🏁 Email producer finished");
          process.exit(0);
        }
      }, 500); // High frequency - 2 emails per second
    },
  });
}

// Image Processing Producer - CPU intensive jobs
if (producerType === "image") {
  app.plugins({
    name: "image-producer",
    fn: async (context, bus) => {
      context.logger.info(
        "🖼️  Image producer started - generating image processing jobs"
      );

      let imageCounter = 0;
      const operations = [
        ["resize", "optimize"],
        ["crop", "watermark"],
        ["convert", "compress"],
        ["thumbnail", "blur"],
      ];
      const formats = ["jpg", "png", "webp"];

      context.setInterval(() => {
        imageCounter++;
        const ops = operations[Math.floor(Math.random() * operations.length)];
        const format = formats[Math.floor(Math.random() * formats.length)];

        bus.emit({
          event: "job.image",
          data: {
            jobId: `image-${producerId}-${imageCounter}`,
            type: "image",
            imageUrl: `https://images.example.com/img${imageCounter}.jpg`,
            operations: ops,
            outputFormat: format,
          },
        });

        context.logger.info(
          `📤 Image job ${imageCounter} (${ops.join("+")}, output: ${format})`
        );

        if (imageCounter >= 30) {
          context.logger.info("🏁 Image producer finished");
          process.exit(0);
        }
      }, 1500); // Slower frequency - image jobs are heavier
    },
  });
}

// Analytics Producer - Real-time event streaming
if (producerType === "analytics") {
  app.plugins({
    name: "analytics-producer",
    fn: async (context, _bus) => {
      context.logger.info(
        "📊 Analytics producer started - streaming user events"
      );

      context.setInterval(() => {
        // send random error to simulate failure
          throw new Error("Simulated failure");

      }, 200); // Very high frequency - 5 events per second
    },
  });
}

// Health Status Producer - Runs on ALL producer instances
if (["email", "image", "analytics"].includes(producerType)) {
  app.plugins({
    name: "health-reporter",
    fn: async (context, bus) => {
      context.logger.info("💓 Health reporter started - broadcasting status");

      let jobsProduced = 0;
      const errors = 0;
      const startTime = Date.now();

      context.setInterval(() => {
        const _uptime = Date.now() - startTime;
        const avgLatency = Math.random() * 50 + 10; // Simulated latency
        const errorRate = errors / Math.max(jobsProduced, 1);

        bus.emit({
          event: "health.status",
          data: {
            producerId,
            status: errorRate > 0.1 ? "degraded" : "healthy",
            timestamp: Date.now(),
            metrics: {
              jobsProduced: ++jobsProduced,
              avgLatency,
              errorRate,
            },
          },
        });

        context.logger.info(
          `💓 Health: ${jobsProduced} jobs, ${avgLatency.toFixed(
            1
          )}ms avg latency`
        );
      }, 5000); // Health report every 5 seconds
    },
  });
}

// Workers - Run on all instances (including worker-only instances)
app.modules({
  name: "email-worker",
  fn: (bus, context) => {
    context.logger.info("📧 Email worker ready - processing email jobs");

    bus.on(
      "job.email",
      (job) => {
        context.logger.info(
          `🎯 Processing email job: ${job.jobId} (${job.priority} priority)`
        );

        // Simulate email processing time based on priority
        const processingTime =
          job.priority === "high"
            ? 200
            : job.priority === "normal"
            ? 500
            : 1000;

        context.setTimeout(() => {
          context.logger.info(
            `✅ Email sent: ${job.subject} to ${job.recipient}`
          );
        }, processingTime);
      },
      { delivery: "queue" }
    );
  },
});

app.modules({
  name: "image-worker",
  fn: (bus, context) => {
    context.logger.info("🖼️  Image worker ready - processing image jobs");

    bus.on(
      "job.image",
      (job) => {
        context.logger.info(
          `🎯 Processing image job: ${job.jobId} (${job.operations.join(
            "+"
          )}, output: ${job.outputFormat})`
        );

        // Simulate longer processing for image jobs
        context.setTimeout(() => {
          context.logger.info(
            `✅ Image processed: ${job.imageUrl} → ${job.outputFormat}`
          );
        }, 2000);
      },
      { delivery: "queue" }
    );
  },
});

app.modules({
  name: "analytics-processor",
  fn: (bus, context) => {
    context.logger.info("📊 Analytics processor ready - processing events");

    bus.on(
      "analytics.event",
      (event) => {
        context.logger.info(
          `🎯 Processing analytics: ${event.action} by ${event.userId}`
        );

        // Analytics processing is fast
        context.setTimeout(() => {
          context.logger.info(`✅ Analytics recorded: ${event.eventId}`);
        }, 100);
      },
      { delivery: "queue" }
    );
  },
});

app.modules({
  name: "health-monitor",
  fn: (bus, context) => {
    context.logger.info("💓 Health monitor ready - collecting producer status");

    bus.on(
      "health.status",
      (status) => {
        const statusIcon =
          status.status === "healthy"
            ? "🟢"
            : status.status === "degraded"
            ? "🟡"
            : "🔴";
        context.logger.info(
          `${statusIcon} ${status.producerId}: ${
            status.metrics.jobsProduced
          } jobs, ${status.metrics.avgLatency.toFixed(1)}ms avg`
        );
      },
      { delivery: "broadcast" }
    ); // All instances should monitor health
  },
});

// Start the application
console.log("🚀 Multi-Producer Distributed System");
console.log("=====================================");
console.log("");

if (producerType === "worker") {
  console.log("⚙️  WORKER-ONLY INSTANCE: Will process jobs from all producers");
} else {
  console.log(
    `🏭 PRODUCER INSTANCE (${producerType}): Will generate ${producerType} jobs + process all jobs`
  );
}

console.log("");
console.log("Usage:");
console.log(
  "  bun run ./examples/multi-producer.ts email      # Email producer"
);
console.log(
  "  bun run ./examples/multi-producer.ts image      # Image producer"
);
console.log(
  "  bun run ./examples/multi-producer.ts analytics  # Analytics producer"
);
console.log("  bun run ./examples/multi-producer.ts            # Worker only");
console.log("");
console.log("Example test scenario:");
console.log(
  "1. Start 2-3 worker instances: bun run ./examples/multi-producer.ts"
);
console.log(
  "2. Start email producer: bun run ./examples/multi-producer.ts email"
);
console.log(
  "3. Start image producer: bun run ./examples/multi-producer.ts image"
);
console.log(
  "4. Start analytics producer: bun run ./examples/multi-producer.ts analytics"
);
console.log("");
console.log("Expected behavior:");
console.log("- Email jobs: Load-balanced across all workers");
console.log("- Image jobs: Load-balanced across all workers");
console.log("- Analytics events: Load-balanced across all workers");
console.log("- Health status: Broadcast to all instances");
console.log("");

app.start();
