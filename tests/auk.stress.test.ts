/** biome-ignore-all lint/suspicious/noExplicitAny: <ignoring for test purposes> */

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
    time: new Date().toISOString(),
  };
}

describe("Auk Stress Test", () => {
  it("handles high event throughput and records resource usage", async () => {
    const logs: string[] = [];
    const logger = createLogger(logs);
    const config: AukConfig = {
      env: process.env.NODE_ENV || "test",
      serviceName: "auk-stress-test",
    };
    const db = {};
    const eventCount = 100_000;
    let received = 0;
    let resolveDone: () => void;
    const done = new Promise<void>((res) => {
      resolveDone = res;
    });

    const usageBefore = getUsage();
    let usageMid: ReturnType<typeof getUsage> | undefined;
    let usageAfter: ReturnType<typeof getUsage> | undefined;

    const stressPlugin = async (_context: any, bus: any) => {
      for (let i = 0; i < eventCount; ++i) {
        await bus.emit({ event: "stress.event", data: { n: i } });
        if (i === Math.floor(eventCount / 2)) usageMid = getUsage();
      }
    };
    const stressModule = (bus: any, _context: any) => {
      bus.on("stress.event", () => {
        received++;
        if (received === eventCount) {
          usageAfter = getUsage();
          resolveDone();
        }
      });
    };

    const auk = new Auk({ config, logger, db });
    auk
      .plugins({ name: "stressPlugin", fn: stressPlugin })
      .modules({ name: "stressModule", fn: stressModule });
    const startPromise = auk.start();
    await done;

    // Output stats in table
    const before = usageBefore;
    const mid = usageMid;
    const after = usageAfter;
    if (!mid || !after) {
      throw new Error("Usage data not available");
    }
    function percent(val: number, base: number) {
      return base === 0 ? "N/A" : `${((val / base) * 100).toFixed(1)}%`;
    }
    const table = [
      {
        Metric: "rssMB",
        Before: before.rssMB,
        Mid: mid.rssMB,
        "% Mid": percent(mid.rssMB - before.rssMB, before.rssMB),
        After: after.rssMB,
        "% After": percent(after.rssMB - before.rssMB, before.rssMB),
      },
      {
        Metric: "heapUsedMB",
        Before: before.heapUsedMB,
        Mid: mid.heapUsedMB,
        "% Mid": percent(mid.heapUsedMB - before.heapUsedMB, before.heapUsedMB),
        After: after.heapUsedMB,
        "% After": percent(
          after.heapUsedMB - before.heapUsedMB,
          before.heapUsedMB
        ),
      },
      {
        Metric: "heapTotalMB",
        Before: before.heapTotalMB,
        Mid: mid.heapTotalMB,
        "% Mid": percent(
          mid.heapTotalMB - before.heapTotalMB,
          before.heapTotalMB
        ),
        After: after.heapTotalMB,
        "% After": percent(
          after.heapTotalMB - before.heapTotalMB,
          before.heapTotalMB
        ),
      },
      {
        Metric: "externalMB",
        Before: before.externalMB,
        Mid: mid.externalMB,
        "% Mid": percent(mid.externalMB - before.externalMB, before.externalMB),
        After: after.externalMB,
        "% After": percent(
          after.externalMB - before.externalMB,
          before.externalMB
        ),
      },
      {
        Metric: "cpuUserMS",
        Before: before.cpuUserMS,
        Mid: mid.cpuUserMS,
        "% Mid": percent(mid.cpuUserMS - before.cpuUserMS, before.cpuUserMS),
        After: after.cpuUserMS,
        "% After": percent(
          after.cpuUserMS - before.cpuUserMS,
          before.cpuUserMS
        ),
      },
      {
        Metric: "cpuSystemMS",
        Before: before.cpuSystemMS,
        Mid: mid.cpuSystemMS,
        "% Mid": percent(
          mid.cpuSystemMS - before.cpuSystemMS,
          before.cpuSystemMS
        ),
        After: after.cpuSystemMS,
        "% After": percent(
          after.cpuSystemMS - before.cpuSystemMS,
          before.cpuSystemMS
        ),
      },
    ];
    console.log("Auk Stress Test Results:");
    console.table(table);
    console.log("Events sent:", eventCount);
    console.log("Events received:", received);
    expect(received).toBe(eventCount);
    // Optionally, assert memory/cpu usage is within reasonable bounds
    expect(after.heapUsedMB - before.heapUsedMB).toBeLessThan(100); // <100MB
    process.kill(process.pid, "SIGINT");
    await startPromise;
  }, 20000);
});
