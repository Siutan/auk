import { Auk } from "../src";

const app = new Auk();

app.plugins({
  name: "greet-plugin",
  fn: async (context, bus) => {
    context.logger.info("Plugin started");
    let count = 0;
    const interval = setInterval(() => {
      bus.emitSync({ event: "greet", data: "Hello, world!" });
      count++;
      if (count >= 5) {
        clearInterval(interval);
      }
    }, 1000);

  },
});

app.modules({
  fn: (bus, context) => {
    bus.on("greet", (data) => {
      context.logger.info(`Received: ${data}`);
    });
  },
  name: "greet-module",
});

app.start().then(() => {
  console.log("Application started");
});