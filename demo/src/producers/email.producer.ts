import { plugin } from "../../../core/src";

export const emailProducer = plugin({
  name: "email handler",
  fn: (bus, context) => {
    // register events
    bus.emitSync({
      event: "email.signup",
      data: {
        email: "no idea",
      },
    });

    bus.on("email.completed-signup", (data) => {
      console.log(data.what);
    });
  },
});
