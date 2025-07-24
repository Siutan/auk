/** biome-ignore-all lint/suspicious/noExplicitAny:<Data could be anything, i should change ln 34 though> */
import type { TSchema } from "core";
import type { AzureServiceBusConfig } from "./azure.js";
import type { RabbitMQConfig } from "./rabbitmq";

export interface UmqProvider {
  publish(
    event: string,
    data: { event: string; payload: unknown }
  ): Promise<void>;
  subscribe(
    event: string | string[],
    handler: (data: { event: string; payload: unknown }) => void
  ): Promise<void>;
  close(): Promise<void>;
  setSchemas(schemas: Record<string, TSchema>): void;
}

export type UmqConfigOptions = {
  schemas: Record<string, TSchema>;
  events: string[];
} & (
  | { provider: "rabbitmq"; config: RabbitMQConfig }
  | { provider: "azure"; config: AzureServiceBusConfig }
  | { provider: "kafka"; config: any }
);

declare module "core" {
  interface Auk {
    umq: {
      emit(event: string, data: any): Promise<void>;
    };
  }
}

export * from "./azure.js";
export * from "./rabbitmq.js";
