import { Auk, type AukConfig } from "../src/index";

function createLogger(logs: string[] = []) {
  return {
    info: (...args: unknown[]) => logs.push(`[INFO] ${args.join(" ")}`),
    warn: (...args: unknown[]) => logs.push(`[WARN] ${args.join(" ")}`),
    error: (...args: unknown[]) => logs.push(`[ERROR] ${args.join(" ")}`),
    debug: (...args: unknown[]) => logs.push(`[DEBUG] ${args.join(" ")}`),
    logs,
  };
}

function getUsage() {
  const mem = process.memoryUsage();
  const cpu = process.cpuUsage();
  return {
    rssMB: Number((mem.rss / 1024 / 1024).toFixed(2)),
    heapUsedMB: Number((mem.heapUsed / 1024 / 1024).toFixed(2)),
    heapTotalMB: Number((mem.heapTotal / 1024 / 1024).toFixed(2)),
    externalMB: Number((mem.external / 1024 / 1024).toFixed(2)),
    cpuUserMS: Number((cpu.user / 1000).toFixed(2)),
    cpuSystemMS: Number((cpu.system / 1000).toFixed(2)),
    time: Date.now(),
  };
}

describe("Auk Performance Tests", () => {
  it("measures event emission overhead vs raw EventEmitter", async () => {
    const iterations = 100_000;
    const logs: string[] = [];
    const logger = createLogger(logs);
    const config: AukConfig = {
      env: process.env.NODE_ENV || "test",
      serviceName: "auk-perf-test",
    };

    // Test raw EventEmitter
    const { EventEmitter } = require("node:events");
    const rawEmitter = new EventEmitter();
    let rawCount = 0;
    let rawDone: () => void;
    const rawPromise = new Promise<void>((resolve) => {
      rawDone = resolve;
    });
    rawEmitter.on("test", () => {
      rawCount++;
      if (rawCount === iterations) rawDone();
    });
    const rawStart = performance.now();
    for (let i = 0; i < iterations; i++) {
      rawEmitter.emit("test", { data: i });
    }
    await rawPromise;
    const rawEnd = performance.now();
    const rawTime = rawEnd - rawStart;

    // Test Auk
    const auk = new Auk({ config, logger, db: {} });
    let aukCount = 0;
    let aukDone: () => void;
    const aukPromise = new Promise<void>((resolve) => {
      aukDone = resolve;
    });
    auk.modules({
      name: "test-module",
      fn: (bus, _context) => {
        bus.on("test", () => {
          aukCount++;
          if (aukCount === iterations) aukDone();
        });
      },
    });
    auk.plugins({
      name: "test-plugin",
      fn: async (_context, bus) => {
        for (let i = 0; i < iterations; i++) {
          bus.emitSync({ event: "test", data: { value: i } });
        }
      },
    });
    const aukStart = performance.now();
    const startPromise = auk.start();
    await aukPromise;
    await auk.stop();
    await startPromise;
    const aukEnd = performance.now();
    const aukTime = aukEnd - aukStart;

    const overhead = (((aukTime - rawTime) / rawTime) * 100).toFixed(1);

    console.log("\n=== Event Emission Overhead ===");
    console.log(
      `Raw EventEmitter: ${rawTime.toFixed(2)}ms (${(
        (iterations / rawTime) *
        1000
      ).toFixed(0)} ops/sec)`
    );
    console.log(
      `Auk EventBus: ${aukTime.toFixed(2)}ms (${(
        (iterations / aukTime) *
        1000
      ).toFixed(0)} ops/sec)`
    );
    console.log(`Overhead: ${overhead}%`);

    expect(rawCount).toBe(iterations);
    expect(aukCount).toBe(iterations);
    expect(Number.parseFloat(overhead)).toBeLessThan(50); // Less than 50% overhead
  });

  it("measures startup time with many plugins/modules", async () => {
    const pluginCount = 10;
    const moduleCount = 10;
    const logs: string[] = [];
    const logger = createLogger(logs);
    const config: AukConfig = {
      env: process.env.NODE_ENV || "test",
      serviceName: "auk-startup-test",
    };

    const auk = new Auk({ config, logger, db: {} });

    // Add many plugins (simplified - no events)
    for (let i = 0; i < pluginCount; i++) {
      auk.plugins({
        name: `plugin-${i}`,
        fn: async (_context, _bus) => {
          // Simulate minimal async work
          await new Promise((resolve) => setTimeout(resolve, 1));
        },
      });
    }

    // Add many modules (simplified - no listeners)
    for (let i = 0; i < moduleCount; i++) {
      auk.modules({
        name: `module-${i}`,
        fn: (_bus, _context) => {
          // Module just registers
        },
      });
    }

    const startTime = performance.now();
    const startPromise = auk.start();

    // Give a reasonable amount of time for startup, then stop
    await new Promise((resolve) => setTimeout(resolve, 50));

    await auk.stop();
    await startPromise;
    const endTime = performance.now();
    const startupTime = endTime - startTime;

    console.log("\n=== Startup Performance ===");
    console.log(`Plugins: ${pluginCount}, Modules: ${moduleCount}`);
    console.log(`Startup time: ${startupTime.toFixed(2)}ms`);
    console.log(`Avg per plugin: ${(startupTime / pluginCount).toFixed(2)}ms`);
    console.log(`Avg per module: ${(startupTime / moduleCount).toFixed(2)}ms`);
    console.log("Test completed successfully!");

    expect(startupTime).toBeLessThan(500); // Less than 500ms
  });

  it("measures memory usage under sustained load", async () => {
    const logs: string[] = [];
    const logger = createLogger(logs);
    const config: AukConfig = {
      env: process.env.NODE_ENV || "test",
      serviceName: "auk-memory-test",
    };

    const auk = new Auk({ config, logger, db: {} });
    const eventCounts: number[] = [];

    auk.modules({
      name: "memory-test-module",
      fn: (bus, _context) => {
        // biome-ignore lint/suspicious/noExplicitAny: <ignoring for test purposes>
        bus.on("memory-test", (data: any) => {
          // Simulate some processing
          eventCounts.push(data.count);
        });
      },
    });

    const startPromise = auk.start();
    await new Promise((r) => setTimeout(r, 10));

    const baselineUsage = getUsage();
    const measurements: Array<{
      time: number;
      usage: ReturnType<typeof getUsage>;
      events: number;
    }> = [];

    // Emit events in batches and measure
    const batchSize = 10_000;
    const batches = 10;

    for (let batch = 0; batch < batches; batch++) {
      const batchStart = performance.now();
      for (let i = 0; i < batchSize; i++) {
        await auk.eventBus.emit({
          event: "memory-test",
          data: { count: batch * batchSize + i },
        });
      }
      const batchEnd = performance.now();
      measurements.push({
        time: batchEnd - batchStart,
        usage: getUsage(),
        events: (batch + 1) * batchSize,
      });
    }
    await auk.stop();
    await startPromise;

    console.log("\n=== Memory Usage Under Load ===");
    console.log(
      "Batch | Events | Time(ms) | HeapUsed(MB) | RSS(MB) | Throughput(ops/sec)"
    );
    console.log(
      "------|--------|----------|--------------|---------|-------------------"
    );

    measurements.forEach((m, i) => {
      const heapDiff = m.usage.heapUsedMB - baselineUsage.heapUsedMB;
      const rssDiff = m.usage.rssMB - baselineUsage.rssMB;
      const throughput = ((batchSize / m.time) * 1000).toFixed(0);

      console.log(
        `${i + 1}`.padStart(5) +
          ` | ${m.events}`.padStart(7) +
          ` | ${m.time.toFixed(1)}`.padStart(9) +
          ` | ${m.usage.heapUsedMB}(+${heapDiff.toFixed(1)})`.padStart(13) +
          ` | ${m.usage.rssMB}(+${rssDiff.toFixed(1)})`.padStart(8) +
          ` | ${throughput}`.padStart(18)
      );
    });

    const finalUsage = measurements[measurements.length - 1]?.usage;
    if (!finalUsage) throw new Error("No final usage found");
    const totalEvents = batches * batchSize;

    expect(eventCounts.length).toBe(totalEvents);
    expect(finalUsage.heapUsedMB - baselineUsage.heapUsedMB).toBeLessThan(500); // Less than 500MB growth
  });

  it("measures event listener performance with many listeners", async () => {
    const logs: string[] = [];
    const logger = createLogger(logs);
    const config: AukConfig = {
      env: process.env.NODE_ENV || "test",
      serviceName: "auk-listener-test",
    };

    const auk = new Auk({ config, logger, db: {} });
    const listenerCount = 1000;
    const counters: number[] = new Array(listenerCount).fill(0);

    // Add many listeners to the same event
    auk.modules({
      name: "broadcast-listeners",
      fn: (bus, _context) => {
        for (let i = 0; i < listenerCount; i++) {
          bus.on("broadcast", () => {
            counters[i] = (counters[i] || 0) + 1;
          });
        }
      },
    });

    const startPromise = auk.start();
    await new Promise((r) => setTimeout(r, 10));

    const eventCount = 1000;
    const start = performance.now();

    for (let i = 0; i < eventCount; i++) {
      await auk.eventBus.emit({ event: "broadcast", data: { id: i } });
    }

    const end = performance.now();
    const duration = end - start;
    const totalNotifications = eventCount * listenerCount;

    console.log("\n=== Many Listeners Performance ===");
    console.log(`Listeners: ${listenerCount}`);
    console.log(`Events: ${eventCount}`);
    console.log(`Total notifications: ${totalNotifications}`);
    console.log(`Duration: ${duration.toFixed(2)}ms`);
    console.log(
      `Throughput: ${((totalNotifications / duration) * 1000).toFixed(
        0
      )} notifications/sec`
    );
    console.log(`Avg per event: ${(duration / eventCount).toFixed(3)}ms`);

    // Verify all listeners received all events
    counters.forEach((count) => {
      expect(count).toBe(eventCount);
    });

    expect(duration).toBeLessThan(5000); // Should complete in under 5 seconds
    await auk.stop();
    await startPromise;
  });
});
