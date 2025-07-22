import { module } from "../../../core/src";

export const signupModule = module({
  name: "signup-emitter",
  fn: (bus) => {
    bus.on("email.signup.started", (data) => {
      console.log(data);
    });
  },
});

export const signupCompleteModule = module({
  name: "signup-complete-module",
  fn: (bus) => {
    bus.on("email.signup.completed", (data) => {
      console.log(data);
    });
  },
});
