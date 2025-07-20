import { Auk, Type } from "../src";

// Define event schemas
const StressEventSchema = Type.Object({
  n: Type.Number(),
});

describe("Auk - Correctness and Stress (Type-safe)", () => {
  it("handles high-throughput, type-safe events with correct delivery and no duplicates", async () => {
    const eventCount = 10_000;
    let received = 0;
    const receivedSet = new Set<number>();
    let resolveDone: (() => void) | undefined;

    // Create logger for context
    const logs: string[] = [];
    const logger = {
      info: (...args: unknown[]) => {
        const msg = `[INFO] ${args.join(" ")}`;
        logs.push(msg);
      },
      warn: (...args: unknown[]) => {
        const msg = `[WARN] ${args.join(" ")}`;
        logs.push(msg);
      },
      error: (...args: unknown[]) => {
        const msg = `[ERROR] ${args.join(" ")}`;
        logs.push(msg);
      },
      debug: (...args: unknown[]) => {
        const msg = `[DEBUG] ${args.join(" ")}`;
        logs.push(msg);
      },
    };

    // Create Auk instance with proper configuration
    const app = new Auk({
      config: {
        env: "test",
        serviceName: "stress-test",
      },
      logger,
    }).event("stress.event", StressEventSchema);

    // Register a module that listens for stress events
    app.modules({
      name: "stress-listener",
      fn: (bus, context) => {
        bus.on("stress.event", (payload) => {
          // TypeScript infers payload: { n: number }
          if (receivedSet.has(payload.n)) {
            throw new Error(`Duplicate event: ${payload.n}`);
          }
          receivedSet.add(payload.n);
          received++;
          // Optionally, log at intervals
          if (received % 1000 === 0)
            context.logger.info(`Received ${received}`);
          // Resolve the test when all events are received
          if (received === eventCount && resolveDone) resolveDone();
        });
      },
    });

    // Promise resolves when all events are received
    const done = new Promise<void>((resolve) => {
      resolveDone = resolve;
      // Optionally, resolve immediately if all events are received
      if (received === eventCount) resolveDone();
    });

    // Add a timeout to prevent infinite waiting
    const timeoutPromise = new Promise<void>((_, reject) => {
      setTimeout(() => {
        reject(
          new Error(`Timeout: Only received ${received}/${eventCount} events`)
        );
      }, 10000); // 10 second timeout
    });

    // Register a plugin to emit events
    app.plugins({
      name: "stress-emitter",
      fn: async (_context, bus) => {
        for (let i = 0; i < eventCount; i++) {
          await bus.emit({
            event: "stress.event",
            data: { n: i },
          });
        }
        // Log when all events are emitted
        _context.logger.info(`Emitted ${eventCount} events`);
      },
    });

    // Start the Auk service
    app.start();

    // Wait for the receiving module to finish with timeout
    await Promise.race([done, timeoutPromise]);

    // Stop the service properly
    await app.stop();

    // Correctness assertions
    expect(received).toBe(eventCount);
    expect(receivedSet.size).toBe(eventCount);

    // Cleanup: remove the module and ensure no further handling
    expect(received).toBe(eventCount);

    // Optionally: check no logs of error/warn
    expect(logs.filter((l) => l.startsWith("[ERROR]")).length).toBe(0);
  }, 15000);
});
