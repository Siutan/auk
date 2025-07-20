/**
 * Example: Testing Auk Sentry Middleware
 *
 * This example demonstrates how to use the sentryMiddleware with Auk.
 * Instead of sending errors to Sentry, it logs them to the console.
 */

import { sentryMiddleware } from "../../addons/dist/sentry.js";
import { Auk, Type } from "../src";

const app = new Auk({
  config: { env: "test", serviceName: "sentry-test" },
});

app.event("fail.event", Type.Object({ foo: Type.String() }));

app.middleware(
  sentryMiddleware({
    dsn: "mock://test",
    // add your own options here
    beforeSend(event, hint) {
      console.log("[MOCK SENTRY] beforeSend called", event, hint);
      return event;
    },
  })
);

app.plugins({
  name: "error-plugin",
  fn: (_context, bus) => {
    try {
      bus.emitSync({ event: "fail.event", data: { foo: "bar" } });
    } catch (err) {
      console.log("[AUK] Error caught in plugin:", err.message);
    }
  },
});

app.modules({
  name: "error-module",
  fn: (bus) => {
    bus.on("fail.event", (data) => {
      console.log(data.bar);
      throw new Error("This is a test error for Sentry!");
    });
  },
});

// stop after 3 seconds
setTimeout(() => {
  app.stop();
}, 3000);

app.start();


