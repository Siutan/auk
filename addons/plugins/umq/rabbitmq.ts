import type { UmqProvider } from "./index";
import amqp, { type ConsumeMessage } from "amqplib";

export class RabbitMQProvider implements UmqProvider {
  private connection: any | null = null;
  private channel: any | null = null;

  constructor(private config: { url: string }) {}

  private async connect() {
    if (this.connection) return;
    this.connection = await amqp.connect(this.config.url);
    this.channel = await this.connection.createChannel();
  }

  async publish(event: string, data: any): Promise<void> {
    await this.connect();
    if (!this.channel) throw new Error("RabbitMQ channel not available");

    const exchange = "auk_events";
    await this.channel.assertExchange(exchange, "topic", { durable: false });
    this.channel.publish(exchange, event, Buffer.from(JSON.stringify(data)));
  }

  async subscribe(event: string, handler: (data: any) => void): Promise<void> {
    await this.connect();
    if (!this.channel) throw new Error("RabbitMQ channel not available");

    const exchange = "auk_events";
    await this.channel.assertExchange(exchange, "topic", { durable: false });
    const q = await this.channel.assertQueue("", { exclusive: true });
    this.channel.bindQueue(q.queue, exchange, event);
    this.channel.consume(
      q.queue,
      (msg: ConsumeMessage | null) => {
        if (msg?.content) {
          handler(JSON.parse(msg.content.toString()));
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