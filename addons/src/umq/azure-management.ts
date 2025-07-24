import { ServiceBusManagementClient } from "@azure/arm-servicebus";
import { DefaultAzureCredential } from "@azure/identity";

export interface AzureServiceBusManagementConfig {
  subscriptionId: string;
  resourceGroupName: string;
  namespace: string;
  // For topic mode
  topicName?: string;
  subscriptionName?: string;
  // For queue mode
  queueName?: string;
}

/**
 * Utility class to manage Azure Service Bus resources (topics and subscriptions)
 * This requires Azure Active Directory credentials and proper permissions
 */
export class AzureServiceBusManager {
  private client: ServiceBusManagementClient;
  private config: AzureServiceBusManagementConfig;

  constructor(config: AzureServiceBusManagementConfig) {
    this.config = config;
    
    // DefaultAzureCredential will use environment variables or managed identity
    const credential = new DefaultAzureCredential();
    this.client = new ServiceBusManagementClient(credential, config.subscriptionId);
  }

  /**
   * Ensures that the topic and subscription exist, creating them if they don't
   * @param topicName Optional topic name (overrides the one in config)
   * @param subscriptionName Optional subscription name (overrides the one in config)
   */
  async ensureTopicAndSubscriptionExist(topicName?: string, subscriptionName?: string): Promise<void> {
    const topic = topicName || this.config.topicName;
    const subscription = subscriptionName || this.config.subscriptionName;
    
    if (!topic || !subscription) {
      throw new Error("Topic name and subscription name are required for topic mode");
    }
    try {
      // Check if topic exists
      let topicExists = false;
      try {
        await this.client.topics.get(
          this.config.resourceGroupName,
          this.config.namespace,
          topic
        );
        topicExists = true;
      } catch (error: any) {
        if (error?.statusCode === 404) {
          console.log(`Topic '${topic}' does not exist. Creating it...`);
        } else {
          throw error;
        }
      }

      // Create topic if it doesn't exist
      if (!topicExists) {
        await this.client.topics.createOrUpdate(
          this.config.resourceGroupName,
          this.config.namespace,
          topic,
          {
            enableBatchedOperations: true,
          }
        );
        console.log(`Topic '${topic}' created successfully.`);
      }

      // Check if subscription exists
      let subscriptionExists = false;
      try {
        await this.client.subscriptions.get(
          this.config.resourceGroupName,
          this.config.namespace,
          topic,
          subscription
        );
        subscriptionExists = true;
      } catch (error: any) {
        if (error?.statusCode === 404) {
          console.log(`Subscription '${subscription}' does not exist. Creating it...`);
        } else {
          throw error;
        }
      }

      // Create subscription if it doesn't exist
      if (!subscriptionExists) {
        await this.client.subscriptions.createOrUpdate(
          this.config.resourceGroupName,
          this.config.namespace,
          topic,
          subscription,
          {
            deadLetteringOnMessageExpiration: true,
            maxDeliveryCount: 10,
          }
        );
        console.log(`Subscription '${subscription}' created successfully.`);
      }

      console.log('Azure Service Bus resources verified and created if needed.');
    } catch (error) {
      console.error('Error ensuring Azure Service Bus resources exist:', error);
      throw error;
    }
  }

  /**
   * Creates a queue if it doesn't exist
   * @param queueName The name of the queue to create
   */
  async createQueueIfNotExists(queueName: string): Promise<void> {
    try {
      // Check if queue exists
      let queueExists = false;
      try {
        await this.client.queues.get(
          this.config.resourceGroupName,
          this.config.namespace,
          queueName
        );
        queueExists = true;
      } catch (error: any) {
        if (error?.statusCode === 404) {
          console.log(`Queue '${queueName}' does not exist. Creating it...`);
        } else {
          throw error;
        }
      }

      // Create queue if it doesn't exist
      if (!queueExists) {
        await this.client.queues.createOrUpdate(
          this.config.resourceGroupName,
          this.config.namespace,
          queueName,
          {
            deadLetteringOnMessageExpiration: true,
            maxDeliveryCount: 10,
          }
        );
        console.log(`Queue '${queueName}' created successfully.`);
      }
    } catch (error) {
      console.error('Error creating Azure Service Bus queue:', error);
      throw error;
    }
  }

  /**
   * Ensures that the queue exists, creating it if it doesn't
   * @param queueName Optional queue name (overrides the one in config)
   */
  async ensureQueueExists(queueName?: string): Promise<void> {
    const queue = queueName || this.config.queueName;
    
    if (!queue) {
      throw new Error("Queue name is required for queue mode");
    }

    await this.createQueueIfNotExists(queue);
    console.log('Azure Service Bus queue verified and created if needed.');
  }

  /**
   * Extracts the namespace from a connection string
   * @param connectionString The Azure Service Bus connection string
   * @returns The namespace name or null if not found
   */
  static extractNamespaceFromConnectionString(connectionString: string): string | null {
    const match = connectionString.match(/Endpoint=sb:\/\/([^.]+)\.servicebus\.windows\.net/);
    return match && match[1] ? match[1] : null;
  }
}