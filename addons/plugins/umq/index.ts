import type { PluginFn } from "../../../core/src";
import { type RabbitMQConfig, RabbitMQProvider } from "./rabbitmq";

export interface UmqProvider {
  publish(event: string, data: any): Promise<void>;
  subscribe(event: string, handler: (data: any) => void): Promise<void>;
  close(): Promise<void>;
}

export type UmqPluginOptions = {
  events: string[];
} & (
  | { provider: "rabbitmq"; config: RabbitMQConfig }
  | { provider: "azure"; config: any }
  | { provider: "kafka"; config: any }
);

declare module "../../../core/src/auk" {
  interface Auk {
    umq: {
      emit(event: string, data: any): Promise<void>;
    };
  }
}

export const umqPlugin = ({
  provider,
  config,
  events,
}: UmqPluginOptions): PluginFn<any> => {
  return (auk, ctx, bus) => {
    let umqProvider: UmqProvider;

    switch (provider) {
      case "rabbitmq":
        umqProvider = new RabbitMQProvider(config);
        break;
      // case "azure":
      //   // umqProvider = new AzureProvider(config);
      // case "kafka":
      //   // umqProvider = new KafkaProvider(config);
      default:
        throw new Error(`Unsupported UMQ provider: ${provider}`);
    }

    ctx.logger.info(`UMQ provider initialized: ${provider}`);

    // Add the emit function to the auk instance
    auk.umq = {
      emit: async (event: string, data: any) => {
        await umqProvider.publish(event, { event, payload: data });
      },
    };

    // start listening for events from the UMQ provider
    for (const eventName of events) {
      umqProvider.subscribe(eventName, (data) => {
        if (auk.events[data.event]) {
          bus.emit({ event: data.event, data: data });
        }
      });
    }

    // It's important to clean up resources when the plugin is unloaded.
    ctx.addCleanupHandler("umq-provider", () => {
      umqProvider.close();
    });
  };
};
