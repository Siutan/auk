/** biome-ignore-all lint/suspicious/noExplicitAny: <Data could be anything> */

import { type TSchema, Value } from "core";
import { type Consumer, Kafka, type Producer } from "kafkajs";
import type { UmqProvider } from "./index.js";

export interface KafkaConfig {
  clientId: string;
  brokers: string[];
  topic?: string;
}

export class KafkaProvider implements UmqProvider {
  private schemas: Record<string, TSchema> = {};
  private producer: Producer | null = null;
  private consumer: Consumer | null = null;
  private kafka: Kafka;

  constructor(private config: KafkaConfig) {
    this.kafka = new Kafka({
      clientId: config.clientId,
      brokers: config.brokers,
    });
  }

  setSchemas(schemas: Record<string, TSchema>): void {
    this.schemas = schemas;
  }

  async publish(event: string, data: any): Promise<void> {
    if (!this.producer) {
      this.producer = this.kafka.producer();
      await this.producer.connect();
    }

    // Validate payload if schema exists
    const schema = this.schemas[event];
    if (schema && !Value.Check(schema, data.payload)) {
      console.error(
        `Invalid event payload for ${event}:`,
        Value.Errors(schema, data.payload)
      );
      return;
    }

    const message = typeof data === "string" ? data : JSON.stringify(data);

    const topic = this.config.topic || "auk_events";
    await this.producer.send({
      topic,
      messages: [{ key: event, value: message }],
    });
  }

  async subscribe(
    event: string | string[],
    handler: (data: any) => void
  ): Promise<void> {
    if (!this.consumer) {
      this.consumer = this.kafka.consumer({
        groupId: "auk-consumer-group",
      });
      await this.consumer.connect();
    }

    const topics = Array.isArray(event) ? event : [event];
    const topic = this.config.topic || "auk_events";

    await this.consumer.subscribe({ topic, fromBeginning: true });

    await this.consumer.run({
      eachMessage: async ({ topic, partition, message }) => {
        const event = message.key?.toString() || "";
        if (topics.includes(event) || topics.includes("*")) {
          try {
            const data = message.value?.toString();
            if (data) {
              const parsedData = JSON.parse(data);

              // Validate payload if schema exists
              const schema = this.schemas[event];
              if (schema && !Value.Check(schema, parsedData.payload)) {
                console.error(
                  `Invalid event payload for ${event}:`,
                  Value.Errors(schema, parsedData.payload)
                );
                return;
              }

              handler(parsedData);
            }
          } catch (error) {
            console.error("Error processing message:", error);
          }
        }
      },
    });
  }

  async close(): Promise<void> {
    if (this.producer) {
      await this.producer.disconnect();
    }
    if (this.consumer) {
      await this.consumer.disconnect();
    }
  }
}
