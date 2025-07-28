/** biome-ignore-all lint/suspicious/noExplicitAny:<Data could be anything, i should change ln 34 though> */
import type { TSchema } from "@aukjs/core";
import type { AzureServiceBusConfig } from "./azure.js";
import type { KafkaConfig } from "kafkajs";
import type { RabbitMQConfig } from "./rabbitmq";

// UmqMessageContext and UmqMessageHandler are now exported from triggers/umq.ts
import type { UmqMessageHandler } from "../triggers/umq.js";

export interface UmqProvider {
  publish(event: string, payload: unknown): Promise<void>;
  subscribe(events: string[], handler: UmqMessageHandler): Promise<void>;
  close(): Promise<void>;
  setSchemas(schemas: Record<string, TSchema>): void;
}

export type UmqConfigOptions = {
  schemas: Record<string, TSchema>;
  events: string[];
} & (
  | { provider: "rabbitmq"; config: RabbitMQConfig }
  | { provider: "azure"; config: AzureServiceBusConfig }
  | { provider: "kafka"; config: KafkaConfig }
);

declare module "@aukjs/core" {
  interface Auk {
    umq: {
      emit(event: string, data: any): Promise<void>;
    };
  }
}

export * from "./azure.js";
export * from "./rabbitmq.js";
