/** biome-ignore-all lint/suspicious/noExplicitAny: <ignoring for test purposes> */

import { Auk } from "../src/index";

describe("Auk Cleanup and Shutdown", () => {
  let auk: Auk;
  let cleanupCalls: string[] = [];

  beforeEach(() => {
    cleanupCalls = [];
    auk = new Auk({
      config: { env: "test", serviceName: "cleanup-test" },
    });
  });

  afterEach(async () => {
    if (auk) {
      await auk.stop();
    }
  });

  it("registers and executes cleanup handlers", async () => {
    auk.addCleanupHandler("test-cleanup", () => {
      cleanupCalls.push("test-cleanup");
    });

    auk.addCleanupHandler("another-cleanup", () => {
      cleanupCalls.push("another-cleanup");
    });

    await auk.stop();

    expect(cleanupCalls).toHaveLength(2);
    expect(cleanupCalls).toContain("test-cleanup");
    expect(cleanupCalls).toContain("another-cleanup");
  });

  it("executes cleanup handlers in reverse order (LIFO)", async () => {
    auk.addCleanupHandler("first", () => {
      cleanupCalls.push("first");
    });

    auk.addCleanupHandler("second", () => {
      cleanupCalls.push("second");
    });

    auk.addCleanupHandler("third", () => {
      cleanupCalls.push("third");
    });

    await auk.stop();

    expect(cleanupCalls).toHaveLength(3);
    expect(cleanupCalls[0]).toBe("third");
    expect(cleanupCalls[1]).toBe("second");
    expect(cleanupCalls[2]).toBe("first");
  });

  it("handles async cleanup handlers", async () => {
    auk.addCleanupHandler("async-cleanup", async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
      cleanupCalls.push("async-cleanup");
    });

    auk.addCleanupHandler("sync-cleanup", () => {
      cleanupCalls.push("sync-cleanup");
    });

    await auk.stop();

    expect(cleanupCalls).toHaveLength(2);
    expect(cleanupCalls).toContain("async-cleanup");
    expect(cleanupCalls).toContain("sync-cleanup");
  });

  it("handles cleanup handler errors gracefully", async () => {
    const errorLogs: string[] = [];
    const originalError = console.error;
    console.error = (...args: any[]) => {
      errorLogs.push(args.join(" "));
    };

    auk.addCleanupHandler("error-cleanup", () => {
      throw new Error("Cleanup error");
    });

    auk.addCleanupHandler("success-cleanup", () => {
      cleanupCalls.push("success-cleanup");
    });

    await auk.stop();

    expect(cleanupCalls).toHaveLength(1);
    expect(cleanupCalls[0]).toBe("success-cleanup");
    expect(errorLogs.some((log) => log.includes("Cleanup error"))).toBe(true);

    console.error = originalError;
  });

  it("allows plugins to register cleanup handlers", async () => {
    const testPlugin = {
      name: "cleanup-plugin",
      fn: async (context: any, _bus: any) => {
        context.addCleanupHandler("plugin-cleanup", () => {
          cleanupCalls.push("plugin-cleanup");
        });
      },
    };

    auk.plugins(testPlugin);
    await auk.startNonBlocking();

    await new Promise((r) => setTimeout(r, 50));
    await auk.stop();

    expect(cleanupCalls).toHaveLength(1);
    expect(cleanupCalls[0]).toBe("plugin-cleanup");
  });

  it("allows modules to register cleanup handlers", async () => {
    const testModule = {
      name: "cleanup-module",
      fn: (_bus: any, context: any) => {
        context.addCleanupHandler("module-cleanup", () => {
          cleanupCalls.push("module-cleanup");
        });
      },
    };

    auk.modules(testModule);
    await auk.startNonBlocking();

    await new Promise((r) => setTimeout(r, 50));
    await auk.stop();

    expect(cleanupCalls).toHaveLength(1);
    expect(cleanupCalls[0]).toBe("module-cleanup");
  });

  it("automatically cleans up setInterval", async () => {
    const testPlugin = {
      name: "interval-plugin",
      fn: async (context: any, _bus: any) => {
        const _intervalId = context.setInterval(() => {
          // This should be cleaned up automatically
        }, 100);

        context.addCleanupHandler("interval-check", () => {
          cleanupCalls.push("interval-check");
        });
      },
    };

    auk.plugins(testPlugin);
    await auk.startNonBlocking();

    await new Promise((r) => setTimeout(r, 50));
    await auk.stop();

    expect(cleanupCalls).toHaveLength(1);
    expect(cleanupCalls[0]).toBe("interval-check");
  });

  it("automatically cleans up setTimeout", async () => {
    const testPlugin = {
      name: "timeout-plugin",
      fn: async (context: any, _bus: any) => {
        const _timeoutId = context.setTimeout(() => {
          // This should be cleaned up automatically
        }, 1000);

        context.addCleanupHandler("timeout-check", () => {
          cleanupCalls.push("timeout-check");
        });
      },
    };

    auk.plugins(testPlugin);
    await auk.startNonBlocking();

    await new Promise((r) => setTimeout(r, 50));
    await auk.stop();

    expect(cleanupCalls).toHaveLength(1);
    expect(cleanupCalls[0]).toBe("timeout-check");
  });

  it("prevents multiple shutdowns", async () => {
    auk.addCleanupHandler("test-cleanup", () => {
      cleanupCalls.push("test-cleanup");
    });

    // First shutdown
    await auk.stop();
    expect(cleanupCalls).toHaveLength(1);

    // Second shutdown should not execute cleanup again
    await auk.stop();
    expect(cleanupCalls).toHaveLength(1);
  });

  it("handles programmatic shutdown", async () => {
    auk.addCleanupHandler("programmatic-cleanup", () => {
      cleanupCalls.push("programmatic-cleanup");
    });

    const startPromise = auk.start();

    // Wait a bit then stop programmatically
    await new Promise((r) => setTimeout(r, 10));
    await auk.stop();
    await startPromise;

    expect(cleanupCalls).toHaveLength(1);
    expect(cleanupCalls[0]).toBe("programmatic-cleanup");
  });

  it("handles complex cleanup scenarios", async () => {
    const testPlugin = {
      name: "complex-cleanup-plugin",
      fn: async (context: any, _bus: any) => {
        // Register multiple cleanup handlers
        context.addCleanupHandler("plugin-cleanup-1", () => {
          cleanupCalls.push("plugin-cleanup-1");
        });

        context.addCleanupHandler("plugin-cleanup-2", async () => {
          await new Promise((resolve) => setTimeout(resolve, 5));
          cleanupCalls.push("plugin-cleanup-2");
        });

        // Use auto-cleanup timers
        context.setInterval(() => {}, 100);
        context.setTimeout(() => {}, 1000);
      },
    };

    const testModule = {
      name: "complex-cleanup-module",
      fn: (_bus: any, context: any) => {
        context.addCleanupHandler("module-cleanup", () => {
          cleanupCalls.push("module-cleanup");
        });
      },
    };

    auk.plugins(testPlugin).modules(testModule);
    await auk.startNonBlocking();

    await new Promise((r) => setTimeout(r, 50));
    await auk.stop();

    expect(cleanupCalls).toHaveLength(3);
    expect(cleanupCalls).toContain("plugin-cleanup-1");
    expect(cleanupCalls).toContain("plugin-cleanup-2");
    expect(cleanupCalls).toContain("module-cleanup");
  });

  it("handles cleanup with errors and successful handlers", async () => {
    const errorLogs: string[] = [];
    const originalError = console.error;
    console.error = (...args: any[]) => {
      errorLogs.push(args.join(" "));
    };

    auk.addCleanupHandler("error-handler", () => {
      throw new Error("Cleanup error");
    });

    auk.addCleanupHandler("success-handler-1", () => {
      cleanupCalls.push("success-1");
    });

    auk.addCleanupHandler("success-handler-2", () => {
      cleanupCalls.push("success-2");
    });

    await auk.stop();

    expect(cleanupCalls).toHaveLength(2);
    expect(cleanupCalls).toContain("success-1");
    expect(cleanupCalls).toContain("success-2");
    expect(errorLogs.some((log) => log.includes("Cleanup error"))).toBe(true);

    console.error = originalError;
  });
});
