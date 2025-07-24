import {
  ServiceBusClient,
  type ServiceBusReceivedMessage,
  type ServiceBusReceiver,
  type ServiceBusSender,
} from "@azure/service-bus";
import { type TSchema, Value } from "core";
import type { UmqProvider } from "../umq/index.js";
import { AzureServiceBusManager } from "./azure-management.js";

export interface AzureServiceBusConfig {
  connectionString: string;
  // Mode determines whether to use topics (pub/sub) or queues (point-to-point)
  mode?: "topic" | "queue";
  // Topic mode settings
  topicName?: string;
  subscriptionName?: string;
  // Queue mode settings
  queueName?: string;
  // Management configuration (optional)
  management?: {
    subscriptionId: string;
    resourceGroupName: string;
    // If not provided, will be extracted from connectionString
    namespace?: string;
    // If true, will attempt to create topic/subscription or queue if they don't exist
    autoCreateResources?: boolean;
  };
}

/**
 * Azure Service Bus provider for Auk
 *
 * This provider uses Azure Service Bus to implement the message queue functionality
 * required by Auk. It supports two modes of operation:
 *
 * 1. Topic mode (default): Uses topics and subscriptions for pub/sub messaging where
 *    multiple subscribers can receive the same message.
 *
 * 2. Queue mode: Uses queues for point-to-point messaging where only one receiver
 *    processes each message.
 */
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

    // Determine if we're using topics or queues
    const mode = this.config.mode || "topic";

    if (mode === "topic") {
      const topic = this.config.topicName || "auk_events";
      this.sender = this.client.createSender(topic);
    } else {
      // queue mode
      const queue = this.config.queueName || "auk_events_queue";
      this.sender = this.client.createSender(queue);
    }
  }

  async publish(event: string, payload: any): Promise<void> {
    this.initClient();
    if (!this.sender) throw new Error("ServiceBus sender not available");

    const schema = this.schemas[event];
    if (schema && !Value.Check(schema, payload)) {
      throw new Error(
        `Invalid event payload for ${event}: ${Value.Errors(schema, payload)}`
      );
    }

    const message = {
      body: { event, payload },
      subject: event,
    };

    await this.sender.sendMessages(message);
  }

  async subscribe(
    event: string | string[],
    handler: (data: any) => void
  ): Promise<void> {
    this.initClient();
    if (!this.client) throw new Error("ServiceBus client not available");

    // Determine if we're using topics or queues
    const mode = this.config.mode || "topic";

    if (mode === "topic") {
      const topic = this.config.topicName || "auk_events";
      const subscription = this.config.subscriptionName || `${topic}-subs`;

      // Check if we should try to auto-create resources
      if (this.config.management?.autoCreateResources) {
        try {
          await this.ensureTopicAndSubscriptionExist(topic, subscription);
        } catch (error) {
          console.error("Failed to create Azure Service Bus resources:", error);
          console.error("===== AZURE SERVICE BUS MANAGEMENT ERROR =====");
          console.error(
            "Could not automatically create the required Azure Service Bus resources."
          );
          console.error(
            "Make sure you have provided valid management configuration and proper permissions."
          );
          console.error(
            "You need to install @azure/arm-servicebus and @azure/identity packages:"
          );
          console.error("  bun add @azure/arm-servicebus @azure/identity");
          console.error("=================================================");
        }
      }

      try {
        // Try to create the receiver - this will fail if topic/subscription doesn't exist
        this.receiver = this.client.createReceiver(topic, subscription, {
          // autoCompleteMessages: true by default
        });
      } catch (error) {
        // Print a more helpful error message
        console.error("===== AZURE SERVICE BUS CONFIGURATION ERROR =====");
        console.error(
          `The Azure Service Bus topic '${topic}' or subscription '${subscription}' does not exist.`
        );
        console.error(
          "Please create these resources in the Azure portal before running this application:"
        );
        console.error(`1. Create a topic named: ${topic}`);
        console.error(
          `2. Create a subscription named: ${subscription} under the topic ${topic}`
        );
        console.error(
          "Or enable auto-creation by providing management configuration:"
        );
        console.error(`  management: {
    subscriptionId: "your-subscription-id",
    resourceGroupName: "your-resource-group",
    autoCreateResources: true
  }`);
        console.error("=================================================");
        throw new Error(
          `Azure Service Bus topic '${topic}' or subscription '${subscription}' does not exist`
        );
      }

      const events = Array.isArray(event) ? event : [event];

      // Subscribe to messages
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
                Value.Errors(schema, data.payload).First()
              );
              return;
            }

            handler(data);
          }
        },
        processError: async (err) => {
          console.error("Error from Azure Service Bus subscription:", err);
        },
      });
    } else {
      // queue mode
      const queue = this.config.queueName || "auk_events_queue";

      // Check if we should try to auto-create resources
      if (this.config.management?.autoCreateResources) {
        try {
          await this.ensureQueueExists(queue);
        } catch (error) {
          console.error("Failed to create Azure Service Bus queue:", error);
          console.error("===== AZURE SERVICE BUS MANAGEMENT ERROR =====");
          console.error(
            "Could not automatically create the required Azure Service Bus queue."
          );
          console.error(
            "Make sure you have provided valid management configuration and proper permissions."
          );
          console.error(
            "You need to install @azure/arm-servicebus and @azure/identity packages:"
          );
          console.error("  bun add @azure/arm-servicebus @azure/identity");
          console.error("=================================================");
        }
      }

      try {
        // Try to create the receiver - this will fail if queue doesn't exist
        this.receiver = this.client.createReceiver(queue, {
          // autoCompleteMessages: true by default
        });
      } catch (error) {
        // Print a more helpful error message
        console.error("===== AZURE SERVICE BUS CONFIGURATION ERROR =====");
        console.error(`The Azure Service Bus queue '${queue}' does not exist.`);
        console.error(
          "Please create this resource in the Azure portal before running this application:"
        );
        console.error(`1. Create a queue named: ${queue}`);
        console.error(
          "Or enable auto-creation by providing management configuration:"
        );
        console.error(`  management: {
    subscriptionId: "your-subscription-id",
    resourceGroupName: "your-resource-group",
    autoCreateResources: true
  }`);
        console.error("=================================================");
        throw new Error(`Azure Service Bus queue '${queue}' does not exist`);
      }

      const events = Array.isArray(event) ? event : [event];

      // Subscribe to messages
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
          console.error("Error from Azure Service Bus subscription:", err);
        },
      });
    }
  }

  /**
   * Ensures that the topic and subscription exist by using the AzureServiceBusManager
   */
  private async ensureTopicAndSubscriptionExist(
    topic: string,
    subscription: string
  ): Promise<void> {
    if (!this.config.management) {
      throw new Error(
        "Management configuration is required to create Azure Service Bus resources"
      );
    }

    const { subscriptionId, resourceGroupName } = this.config.management;
    let { namespace } = this.config.management;

    // Extract namespace from connection string if not provided
    if (!namespace) {
      const extractedNamespace =
        AzureServiceBusManager.extractNamespaceFromConnectionString(
          this.config.connectionString
        );
      if (!extractedNamespace) {
        throw new Error(
          "Could not extract namespace from connection string. Please provide it explicitly."
        );
      }
      namespace = extractedNamespace;
    }

    const manager = new AzureServiceBusManager({
      subscriptionId,
      resourceGroupName,
      namespace,
      topicName: topic,
      subscriptionName: subscription,
    });

    await manager.ensureTopicAndSubscriptionExist();
  }

  /**
   * Ensures that the queue exists by using the AzureServiceBusManager
   */
  private async ensureQueueExists(queue: string): Promise<void> {
    if (!this.config.management) {
      throw new Error(
        "Management configuration is required to create Azure Service Bus resources"
      );
    }

    const { subscriptionId, resourceGroupName } = this.config.management;
    let { namespace } = this.config.management;

    // Extract namespace from connection string if not provided
    if (!namespace) {
      const extractedNamespace =
        AzureServiceBusManager.extractNamespaceFromConnectionString(
          this.config.connectionString
        );
      if (!extractedNamespace) {
        throw new Error(
          "Could not extract namespace from connection string. Please provide it explicitly."
        );
      }
      namespace = extractedNamespace;
    }

    const manager = new AzureServiceBusManager({
      subscriptionId,
      resourceGroupName,
      namespace,
      queueName: queue,
    });

    await manager.ensureQueueExists(queue);
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
