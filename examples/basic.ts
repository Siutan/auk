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

// For type safety, you could enhance this example like:
//
// import { Auk, Type } from "../src";
//
// const GreetSchema = Type.Object({
//   message: Type.String(),
//   timestamp: Type.Number(),
// });
//
// const app = new Auk()
//   .event("greet", GreetSchema);
//
// Then your plugins and modules would have full type safety!
// See examples/typed-basic.ts for a complete typed example.
