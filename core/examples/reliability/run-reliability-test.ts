#!/usr/bin/env bun

import { $ } from "bun";

const NATS_CHECK_TIMEOUT = 5000;

// ANSI color codes
const colors = {
  reset: "\x1b[0m",
  bright: "\x1b[1m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  magenta: "\x1b[35m",
  cyan: "\x1b[36m",
};

function colorize(text: string, color: keyof typeof colors): string {
  return `${colors[color]}${text}${colors.reset}`;
}

async function checkNatsServer(): Promise<boolean> {
  try {
    console.log(colorize("🔍 Checking NATS server...", "cyan"));

    // Try to connect to NATS
    const result = await $`timeout 3 nc -z localhost 4222`.quiet();
    return result.exitCode === 0;
  } catch (error) {
    return false;
  }
}

async function startNatsServer(): Promise<void> {
  console.log(colorize("🚀 Starting NATS server...", "yellow"));

  try {
    // Check if NATS is installed
    await $`which nats-server`.quiet();
  } catch (error) {
    console.log(
      colorize("❌ NATS server not found. Please install it:", "red")
    );
    console.log("   brew install nats-server");
    console.log("   # or");
    console.log("   docker run -p 4222:4222 nats:latest");
    process.exit(1);
  }

  // Start NATS server in background
  const natsProcess = Bun.spawn(["nats-server", "--jetstream"], {
    stdout: "pipe",
    stderr: "pipe",
  });

  // Wait a moment for NATS to start
  await new Promise((resolve) => setTimeout(resolve, 2000));

  // Check if it's running
  const isRunning = await checkNatsServer();
  if (!isRunning) {
    console.log(colorize("❌ Failed to start NATS server", "red"));
    process.exit(1);
  }

  console.log(colorize("✅ NATS server started successfully", "green"));

  // Store process for cleanup
  process.on("exit", () => {
    natsProcess.kill();
  });

  process.on("SIGINT", () => {
    natsProcess.kill();
    process.exit(0);
  });
}

async function runTest(mode: "local" | "distributed"): Promise<boolean> {
  console.log(
    colorize(`\n🧪 Running ${mode.toUpperCase()} mode test...`, "bright")
  );

  const args = mode === "distributed" ? ["--distributed"] : [];

  try {
    const result = await $`bun ${import.meta.dir}/event-reliability-test.ts ${args}`.env({
      NODE_ENV: "test",
    });

    return result.exitCode === 0;
  } catch (error) {
    console.error(colorize(`❌ ${mode} test failed:`, "red"), error);
    return false;
  }
}

async function main() {
  console.log(colorize("🎯 Auk Event Reliability Test Runner", "bright"));
  console.log("=".repeat(50));

  const mode = process.argv[2] as "local" | "distributed" | "both" | undefined;

  if (!mode || !["local", "distributed", "both"].includes(mode)) {
    console.log(colorize("Usage:", "yellow"));
    console.log("  bun run-reliability-test.ts <mode>");
    console.log("");
    console.log(colorize("Modes:", "cyan"));
    console.log("  local       - Test local event processing");
    console.log(
      "  distributed - Test distributed event processing (requires NATS)"
    );
    console.log("  both        - Run both local and distributed tests");
    console.log("");
    console.log(colorize("Examples:", "green"));
    console.log("  bun run-reliability-test.ts local");
    console.log("  bun run-reliability-test.ts distributed");
    console.log("  bun run-reliability-test.ts both");
    process.exit(1);
  }

  const results: { mode: string; success: boolean }[] = [];

  // Run local test
  if (mode === "local" || mode === "both") {
    const success = await runTest("local");
    results.push({ mode: "local", success });
  }

  // Run distributed test
  if (mode === "distributed" || mode === "both") {
    // Check if NATS is running
    const natsRunning = await checkNatsServer();

    if (!natsRunning) {
      console.log(
        colorize(
          "⚠️  NATS server not running, attempting to start...",
          "yellow"
        )
      );
      await startNatsServer();
    } else {
      console.log(colorize("✅ NATS server is running", "green"));
    }

    const success = await runTest("distributed");
    results.push({ mode: "distributed", success });
  }

  // Summary
  console.log(colorize("\n📊 Test Results Summary", "bright"));
  console.log("=".repeat(30));

  let allPassed = true;
  for (const result of results) {
    const status = result.success
      ? colorize("✅ PASSED", "green")
      : colorize("❌ FAILED", "red");

    console.log(`${result.mode.padEnd(12)}: ${status}`);

    if (!result.success) {
      allPassed = false;
    }
  }

  console.log("");
  if (allPassed) {
    console.log(colorize("🎉 All tests passed!", "green"));
    process.exit(0);
  } else {
    console.log(colorize("💥 Some tests failed!", "red"));
    process.exit(1);
  }
}

main().catch(console.error);
