import { Auk, Type } from "../../core/src";
import {
  signupCompleteModule,
  signupModule,
} from "./emitters/email.emitter";
import { emailProducer } from "./producers/email.producer";
import { webhookPlugin } from "./plugins/webhook-listener";

const app = new Auk({
  config: {
    env: "demo",
    serviceName: "Production demo",
  },
})
  .plugins(webhookPlugin)
  .modules(signupModule, signupCompleteModule);

app.start();
