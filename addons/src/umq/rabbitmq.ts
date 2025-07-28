/** biome-ignore-all lint/suspicious/noExplicitAny: <Data could be anything> */

import { type TSchema, Value } from "@aukjs/core";
import type { ConsumeMessage } from "amqplib";
import * as amqp from "amqplib";
import type { UmqProvider } from "./index.js";
import type { UmqMessageHandler, UmqMessageContext } from "../triggers/umq.js";

export interface RabbitMQConfig {
  url: string;
  exchange?: string;
  queue?: string;
}

export class RabbitMQProvider implements UmqProvider {
  private schemas: Record<string, TSchema> = {};
  private connection: amqp.ChannelModel | null = null;
  private channel: amqp.Channel | null = null;

  constructor(private config: RabbitMQConfig) {}

  setSchemas(schemas: Record<string, TSchema>): void {
    this.schemas = schemas;
  }

  private async connect() {
    if (this.connection) return;
    this.connection = await amqp.connect(this.config.url);
    this.channel = await this.connection.createChannel();
  }

  async publish(event: string, data: any): Promise<void> {
    await this.connect();
    if (!this.channel) throw new Error("RabbitMQ channel not available");

    const exchange = this.config.exchange || "auk_events";
    await this.channel.assertExchange(exchange, "topic", { durable: true });
    const schema = this.schemas[event];
    if (schema && !Value.Check(schema, data.payload)) {
      console.error(
        `Invalid event payload for ${event}:`,
        Value.Errors(schema, data.payload)
      );
      return;
    }
    const message = typeof data === "string" ? data : JSON.stringify(data);
    this.channel.publish(exchange, event, Buffer.from(message));
  }

  async subscribe(
    event: string | string[],
    handler: UmqMessageHandler
  ): Promise<void> {
    await this.connect();
    if (!this.channel) throw new Error("RabbitMQ channel not available");
    const events = Array.isArray(event) ? event : [event];

    const exchange = this.config.exchange || "auk_events";
    await this.channel.assertExchange(exchange, "topic", { durable: false });
    const queueName = this.config.queue || `auk_${events.join("_")}`;
    const q = await this.channel.assertQueue(queueName, { durable: true });
    for (const e of events) {
      this.channel.bindQueue(q.queue, exchange, e);
    }
    this.channel.consume(
      q.queue,
      async (msg: ConsumeMessage | null) => {
        if (msg?.content) {
          let data: any;
          try {
            data = JSON.parse(msg.content.toString());
          } catch (_e) {
            try {
              data = JSON.parse(
                Buffer.from(msg.content.toString(), "base64").toString()
              );
            } catch (e) {
              console.error(e);
              data = { event: "unknown", payload: msg.content.toString() };
            }
          }
          if (data.event) {
            const schema = this.schemas[data.event];
            if (schema && !Value.Check(schema, data.payload)) {
              console.error(
                `Invalid event payload for ${data.event}:`,
                Value.Errors(schema, data.payload)
              );
              // Reject invalid messages
              this.channel?.nack(msg, false, false); // don't requeue
              return;
            }

            // Create acknowledgment context
            const context: UmqMessageContext = {
              deliveryCount: msg.fields.deliveryTag,
              messageId: msg.properties.messageId,
              timestamp: msg.properties.timestamp || Date.now(),
              ack: async () => {
                this.channel?.ack(msg);
              },
              nack: async () => {
                this.channel?.nack(msg, false, true); // requeue
              },
              reject: async () => {
                this.channel?.nack(msg, false, false); // don't requeue
              },
            };

            try {
              await handler(data, context);
            } catch (error) {
              console.error(`Error processing message for event ${data.event}:`, error);
              // Don't auto-ack on error - let the handler decide via context
            }
          }
        }
      },
      { noAck: false } // Manual acknowledgment
    );
  }

  async close(): Promise<void> {
    if (this.channel) {
      await this.channel.close();
    }
    if (this.connection) {
      await this.connection.close();
    }
  }
}
