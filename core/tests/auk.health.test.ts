/** biome-ignore-all lint/suspicious/noExplicitAny: <ignoring for test purposes> */

import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { Auk } from "../src/index";

describe("Auk Health Checks", () => {
  let auk: Auk;

  beforeEach(() => {
    auk = new Auk({
      config: { env: "test", serviceName: "health-test" },
    });
  });

  afterEach(async () => {
    if (auk) {
      await auk.stop();
    }
  });

  it("starts with healthy status", () => {
    const health = auk.getHealthStatus();
    expect(health.status).toBe("healthy");
    expect(health.checks).toEqual({});
  });

  it("allows updating health checks", () => {
    auk.updateHealthCheck("database", true);
    auk.updateHealthCheck("redis", false);
    auk.updateHealthCheck("api", true);

    const health = auk.getHealthStatus();
    expect(health.status).toBe("unhealthy");
    expect(health.checks.database).toBe(true);
    expect(health.checks.redis).toBe(false);
    expect(health.checks.api).toBe(true);
  });

  it("updates overall status based on all checks", () => {
    // All healthy
    auk.updateHealthCheck("check1", true);
    auk.updateHealthCheck("check2", true);
    auk.updateHealthCheck("check3", true);

    let health = auk.getHealthStatus();
    expect(health.status).toBe("healthy");

    // One unhealthy
    auk.updateHealthCheck("check2", false);
    health = auk.getHealthStatus();
    expect(health.status).toBe("unhealthy");

    // All healthy again
    auk.updateHealthCheck("check2", true);
    health = auk.getHealthStatus();
    expect(health.status).toBe("healthy");
  });

  it("returns a copy of health status", () => {
    auk.updateHealthCheck("test", true);

    const health1 = auk.getHealthStatus();
    const health2 = auk.getHealthStatus();

    expect(health1).not.toBe(health2); // Should be different objects
    expect(health1.status).toBe(health2.status);
    expect(health1.checks.test).toBe(health2.checks.test as boolean);
  });

  it("allows plugins to update health checks", async () => {
    const testPlugin = {
      name: "health-plugin",
      fn: async (_context: any, _bus: any) => {
        // Use the auk instance directly since context doesn't have updateHealthCheck
        auk.updateHealthCheck("plugin-check", true);
        auk.updateHealthCheck("plugin-check-2", false);
      },
    };

    auk.plugins(testPlugin);
    auk.start();

    await new Promise((r) => setTimeout(r, 50));

    const health = auk.getHealthStatus();
    expect(health.checks["plugin-check"]).toBe(true);
    expect(health.checks["plugin-check-2"]).toBe(false);
    expect(health.status).toBe("unhealthy");
  });

  it("allows modules to update health checks", async () => {
    const testModule = {
      name: "health-module",
      fn: (_bus: any, _context: any) => {
        // Use the auk instance directly since context doesn't have updateHealthCheck
        auk.updateHealthCheck("module-check", true);
        auk.updateHealthCheck("module-check-2", true);
      },
    };

    auk.modules(testModule);
    auk.start();

    await new Promise((r) => setTimeout(r, 50));

    const health = auk.getHealthStatus();
    expect(health.checks["module-check"]).toBe(true);
    expect(health.checks["module-check-2"]).toBe(true);
    expect(health.status).toBe("healthy");
  });

  it("handles multiple health check updates", () => {
    const checks = [
      "database",
      "redis",
      "api",
      "queue",
      "cache",
      "storage",
      "network",
      "disk",
    ];

    // Set all to healthy
    checks.forEach((check) => {
      auk.updateHealthCheck(check, true);
    });

    let health = auk.getHealthStatus();
    expect(health.status).toBe("healthy");
    expect(Object.keys(health.checks)).toHaveLength(8);

    // Set some to unhealthy
    auk.updateHealthCheck("database", false);
    auk.updateHealthCheck("redis", false);
    auk.updateHealthCheck("api", false);

    health = auk.getHealthStatus();
    expect(health.status).toBe("unhealthy");
    expect(health.checks.database).toBe(false);
    expect(health.checks.redis).toBe(false);
    expect(health.checks.api).toBe(false);
    expect(health.checks.queue).toBe(true);
  });

  it("updates health status during shutdown", async () => {
    auk.updateHealthCheck("test", true);

    let health = auk.getHealthStatus();
    expect(health.status).toBe("healthy");

    // Start the service
    const startPromise = auk.start();

    // Wait a bit then stop
    await new Promise((r) => setTimeout(r, 10));
    auk.stop();
    await startPromise;

    health = auk.getHealthStatus();
    expect(health.status).toBe("unhealthy");
  });

  it("allows dynamic health check updates", async () => {
    const testPlugin = {
      name: "dynamic-health-plugin",
      fn: async (context: any, bus: any) => {
        // Simulate a health check that changes over time
        let isHealthy = true;

        context.setInterval(() => {
          isHealthy = !isHealthy;
          auk.updateHealthCheck("dynamic-check", isHealthy);
        }, 10);

        await bus.emit({ event: "test.event", data: { message: "hello" } });
      },
    };

    auk.plugins(testPlugin);
    auk.start();

    await new Promise((r) => setTimeout(r, 50));

    const health = auk.getHealthStatus();
    expect(health.checks["dynamic-check"]).toBeDefined();
  });

  it("supports health checks with custom names", () => {
    const customChecks = [
      "postgresql-connection",
      "redis-cluster-status",
      "elasticsearch-health",
      "kafka-broker-status",
      "mongodb-replica-set",
      "rabbitmq-queue-depth",
    ];

    customChecks.forEach((check, index) => {
      auk.updateHealthCheck(check, index % 2 === 0);
    });

    const health = auk.getHealthStatus();
    expect(Object.keys(health.checks)).toHaveLength(6);
    expect(health.checks["postgresql-connection"]).toBe(true);
    expect(health.checks["redis-cluster-status"]).toBe(false);
    expect(health.status).toBe("unhealthy");
  });

  it("handles rapid health check updates", () => {
    // Simulate rapid updates
    for (let i = 0; i < 100; i++) {
      auk.updateHealthCheck("rapid-check", i % 2 === 0);
    }

    const health = auk.getHealthStatus();
    expect(health.checks["rapid-check"]).toBe(false); // Last value should be false
  });
});
