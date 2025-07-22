/** biome-ignore-all lint/suspicious/noExplicitAny: <Data could be anything> */

import amqp, { type ConsumeMessage } from "amqplib";
import type { UmqProvider } from "./index";

export interface RabbitMQConfig {
  url: string;
  exchange?: string;
  queue?: string;
}

export class RabbitMQProvider implements UmqProvider {
  private connection: amqp.ChannelModel | null = null;
  private channel: amqp.Channel | null = null;

  constructor(private config: RabbitMQConfig) {}

  private async connect() {
    if (this.connection) return;
    this.connection = await amqp.connect(this.config.url);
    this.channel = await this.connection.createChannel();
  }

  async publish(event: string, data: any): Promise<void> {
    await this.connect();
    if (!this.channel) throw new Error("RabbitMQ channel not available");

    const exchange = this.config.exchange || "auk_events";
    await this.channel.assertExchange(exchange, "topic", { durable: false });
    const message = typeof data === "string" ? data : JSON.stringify(data);
    this.channel.publish(exchange, event, Buffer.from(message));
  }

  async subscribe(event: string, handler: (data: any) => void): Promise<void> {
    await this.connect();
    if (!this.channel) throw new Error("RabbitMQ channel not available");

    const exchange = this.config.exchange || "auk_events";
    await this.channel.assertExchange(exchange, "topic", { durable: false });
    const q = await this.channel.assertQueue("", { exclusive: true });
    this.channel.bindQueue(q.queue, exchange, event);
    this.channel.consume(
      q.queue,
      (msg: ConsumeMessage | null) => {
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
            handler(data);
          }
        }
      },
      { noAck: true }
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
