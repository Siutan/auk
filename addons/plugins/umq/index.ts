import type { PluginFn } from "../../../core/src";
import { RabbitMQProvider } from "./rabbitmq";

export interface UmqProvider {
  publish(event: string, data: any): Promise<void>;
  subscribe(event: string, handler: (data: any) => void): Promise<void>;
  close(): Promise<void>;
}

export interface UmqPluginOptions {
  provider: "rabbitmq" | "azure" | "kafka";
  config: any;
}

export const umqPlugin = ({ provider, config }: UmqPluginOptions): PluginFn<any> => {
  return (auk, ctx, bus) => {
    let umqProvider: UmqProvider;

    switch (provider) {
      case "rabbitmq":
        umqProvider = new RabbitMQProvider(config);
        break;
      case "azure":
        // umqProvider = new AzureProvider(config);
        break;
      case "kafka":
        // umqProvider = new KafkaProvider(config);
        break;
      default:
        throw new Error(`Unsupported UMQ provider: ${provider}`);
    }

    // At this point, the provider is initialized and ready to be used.
    // For example, you can start listening to all events on the bus
    // and publish them to the message queue.
    bus.on("*", (data: any, eventName?: string) => {
      if (typeof eventName !== 'string') return;
      if (ctx.event?.name === eventName) return; // Avoid infinite loops
      umqProvider.publish(eventName, data);
    });

    // It's important to clean up resources when the plugin is unloaded.
    ctx.addCleanupHandler("umq-provider", () => {
      umqProvider.close();
    });
  };
};