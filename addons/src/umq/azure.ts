import {
  ServiceBusClient,
  type ServiceBusReceivedMessage,
  type ServiceBusReceiver,
  type ServiceBusSender,
} from "@azure/service-bus";
import { type TSchema, Value } from "core";
import type { UmqProvider } from "../umq/index.js";

export interface AzureServiceBusConfig {
  connectionString: string;
  topicName?: string;
  subscriptionName?: string;
}

export class AzureServiceBusProvider implements UmqProvider {
  private schemas: Record<string, TSchema> = {};
  private client: ServiceBusClient | null = null;
  private sender: ServiceBusSender | null = null;
  private receiver: ServiceBusReceiver | null = null;

  constructor(private config: AzureServiceBusConfig) {}

  setSchemas(schemas: Record<string, TSchema>): void {
    this.schemas = schemas;
  }

  private initClient(): void {
    if (this.client) return;
    this.client = new ServiceBusClient(this.config.connectionString);
    const topic = this.config.topicName || "auk_events";
    this.sender = this.client.createSender(topic);
  }

  async publish(event: string, data: any): Promise<void> {
    this.initClient();
    if (!this.sender) throw new Error("ServiceBus sender not initialized");

    // Validate payload if schema exists
    const schema = this.schemas[event];
    if (schema && !Value.Check(schema, data.payload)) {
      console.error(
        `Invalid event payload for ${event}:`,
        Value.Errors(schema, data.payload)
      );
      return;
    }

    const message =
      typeof data === "string"
        ? { body: data, subject: event }
        : { body: JSON.stringify(data), subject: event };

    await this.sender.sendMessages(message);
  }

  async subscribe(
    event: string | string[],
    handler: (data: any) => void
  ): Promise<void> {
    this.initClient();
    if (!this.client) throw new Error("ServiceBus client not available");

    const topic = this.config.topicName || "auk_events";
    const subscription = this.config.subscriptionName || `${topic}-subs`;
    this.receiver = this.client.createReceiver(topic, subscription, {
      // autoCompleteMessages: true by default
    });

    const events = Array.isArray(event) ? event : [event];

    this.receiver.subscribe({
      processMessage: async (msg: ServiceBusReceivedMessage) => {
        if (msg.subject && events.includes(msg.subject)) {
          let payload: any;
          try {
            payload =
              typeof msg.body === "string" ? JSON.parse(msg.body) : msg.body;
          } catch (e) {
            console.error("Failed to parse message body", e);
            return;
          }

          // If it's wrapped as { event, payload }
          const data = payload.event
            ? payload
            : { event: msg.subject, payload };

          const schema = this.schemas[data.event];
          if (schema && !Value.Check(schema, data.payload)) {
            console.error(
              `Invalid event payload for ${data.event}:`,
              Value.Errors(schema, data.payload)
            );
            return;
          }

          handler(data);
        }
      },
      processError: async (err) => {
        console.error("Error receiving messages", err);
      },
    });
  }

  async close(): Promise<void> {
    if (this.sender) {
      await this.sender.close();
    }
    if (this.receiver) {
      await this.receiver.close();
    }
    if (this.client) {
      await this.client.close();
    }
  }
}
