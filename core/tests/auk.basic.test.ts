/** biome-ignore-all lint/suspicious/noExplicitAny: <ignoring for test purposes> */

import { Auk, type AukConfig, getAukConfig } from "../src/index";

function createLogger(logs: string[] = []) {
  return {
    info: (...args: unknown[]) => logs.push(`[INFO] ${args.join(" ")}`),
    warn: (...args: unknown[]) => logs.push(`[WARN] ${args.join(" ")}`),
    error: (...args: unknown[]) => logs.push(`[ERROR] ${args.join(" ")}`),
    debug: (...args: unknown[]) => logs.push(`[DEBUG] ${args.join(" ")}`),
    logs,
  };
}

describe("Auk Basic Functionality", () => {
  it("registers plugins and modules, emits and receives events", async () => {
    const logs: string[] = [];
    const logger = createLogger(logs);
    const events: string[] = [];
    const config: AukConfig = { env: process.env.NODE_ENV || "test" };
    const db = { test: true };

    let pluginCalled = false;
    let moduleCalled = false;

    const testPlugin = async (_context: any, bus: any) => {
      pluginCalled = true;
      await bus.emit({ event: "test.event", data: { foo: "bar", count: 42 } });
    };
    const testModule = (bus: any, _context: any) => {
      bus.on("test.event", (data: any) => {
        moduleCalled = true;
        events.push(data.foo);
        expect(data.count).toBe(42);
      });
    };

    const auk = new Auk({ config, logger, db });
    auk
      .plugins({ name: "testPlugin", fn: testPlugin })
      .modules({ name: "testModule", fn: testModule });
    const startPromise = auk.start();

    // Wait a tick to ensure plugins/modules run
    await new Promise((r) => setTimeout(r, 10));

    expect(pluginCalled).toBe(true);
    expect(moduleCalled).toBe(true);
    expect(events).toContain("bar");
    expect(getAukConfig().env).toEqual(process.env.NODE_ENV || "test");
    expect(getAukConfig().serviceName).toBe("auk-service");
    expect(logger.logs.some((l) => l.includes("Service"))).toBe(true);

    process.kill(process.pid, "SIGINT");
    await startPromise;
  });

  it("supports wildcard event listeners", async () => {
    const logs: string[] = [];
    const logger = createLogger(logs);
    const config: AukConfig = { env: process.env.NODE_ENV || "test" };
    const db = { test: true };
    // Avoid possible 'received' undefined errors by capturing in closure
    const received = {
      exact: 0,
      star: 0,
      prefix: 0,
      suffix: 0,
      complex: 0,
    } as const;
    const eventsToEmit = [
      { event: "user.created", data: { id: 1 } },
      { event: "user.updated", data: { id: 1 } },
      { event: "order.created", data: { id: 2 } },
      { event: "user.123.updated", data: { id: 3 } },
    ];
    const auk = new Auk({ config, logger, db });
    auk.modules({
      name: "wildcardModule",
      fn: (bus: any) => {
        // Capture 'received' in closure to avoid possible undefined errors
        bus.on("user.created", (_data: any) => {
          (received as any).exact++;
        });
        bus.on("*", (_data: any) => {
          (received as any).star++;
        });
        bus.on("user.*", (_data: any) => {
          (received as any).prefix++;
        });
        bus.on("*.created", (_data: any) => {
          (received as any).suffix++;
        });
        bus.on("user.*.updated", (_data: any) => {
          (received as any).complex++;
        });
      },
    });
    const startPromise = auk.start();
    await new Promise((r) => setTimeout(r, 10));
    for (const e of eventsToEmit) {
      await auk.eventBus.emit(e);
    }
    // Table output (array of objects for console.table)
    const table = [
      {
        Listener: "exact",
        Expected: 1,
        Actual: received.exact,
        "% of Events": `${(
          (received.exact / eventsToEmit.length) *
          100
        ).toFixed(1)}%`,
      },
      {
        Listener: "*",
        Expected: 4,
        Actual: received.star,
        "% of Events": `${((received.star / eventsToEmit.length) * 100).toFixed(
          1
        )}%`,
      },
      {
        Listener: "user.*",
        Expected: 2,
        Actual: received.prefix,
        "% of Events": `${(
          (received.prefix / eventsToEmit.length) *
          100
        ).toFixed(1)}%`,
      },
      {
        Listener: "*.created",
        Expected: 2,
        Actual: received.suffix,
        "% of Events": `${(
          (received.suffix / eventsToEmit.length) *
          100
        ).toFixed(1)}%`,
      },
      {
        Listener: "user.*.updated",
        Expected: 1,
        Actual: received.complex,
        "% of Events": `${(
          (received.complex / eventsToEmit.length) *
          100
        ).toFixed(1)}%`,
      },
    ];
    console.log("Wildcard Listener Results:");
    console.table(table);
    // Assertions
    expect(received.exact).toBe(1);
    expect(received.star).toBe(4);
    expect(received.prefix).toBe(2);
    expect(received.suffix).toBe(2);
    expect(received.complex).toBe(1);
    process.kill(process.pid, "SIGINT");
    await startPromise;
  });
});
