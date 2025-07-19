/** biome-ignore-all lint/suspicious/noExplicitAny: <the data is not known by the plugin> */
import {
  type ConnectionOptions,
  connect,
  JSONCodec,
  type NatsConnection,
  type Subscription,
} from "nats";
import type { Broker, Delivery } from "../../../core/src/index.js";

/**
 * NATS connection options extending the base NATS ConnectionOptions.
 */
export interface NATSOptions extends ConnectionOptions {
  /**
   * NATS server URL(s).
   */
  servers?: string | string[];
}

/**
 * NATS broker implementation for Auk distributed mode.
 */
export class NATS implements Broker {
  private connection?: NatsConnection;
  private codec = JSONCodec();
  private subscriptions = new Map<string, Subscription>();
  private options: NATSOptions;

  /**
   * Create a new NATS broker instance.
   * @param options - NATS connection options
   */
  constructor(options: NATSOptions = {}) {
    this.options = options;
  }

  /**
   * Ensure connection is established.
   * @private
   */
  private async ensureConnection(): Promise<NatsConnection> {
    if (!this.connection) {
      this.connection = await connect(this.options);
    }
    return this.connection;
  }

  /**
   * Publish an event to NATS.
   * @param event - The event name
   * @param data - The event data
   */
  async publish(event: string, data: any): Promise<void> {
    const connection = await this.ensureConnection();
    const encodedData = this.codec.encode(data);
    connection.publish(event, encodedData);
  }

  /**
   * Subscribe to an event from NATS.
   * @param event - The event name
   * @param handler - The handler function
   * @param opts - Optional delivery configuration
   */
  subscribe(
    event: string,
    handler: (data: any) => void,
    opts?: { delivery?: Delivery }
  ): void {
    this.ensureConnection()
      .then((connection) => {
        const subject = event;
        const queueGroup =
          opts?.delivery === "queue" ? `auk-${event}` : undefined;
        const subscriptionKey = `${event}-${queueGroup || "broadcast"}`;

        // Check if we already have a subscription for this event+delivery combination
        if (this.subscriptions.has(subscriptionKey)) {
          return;
        }

        const subscription = connection.subscribe(subject, {
          queue: queueGroup,
        });
        this.subscriptions.set(subscriptionKey, subscription);

        // Process messages asynchronously
        (async () => {
          for await (const message of subscription) {
            try {
              const data = this.codec.decode(message.data);
              handler(data);
            } catch (error) {
              console.error(
                `[NATS] Error processing message for ${event}:`,
                error
              );
            }
          }
        })().catch((error) => {
          console.error(`[NATS] Subscription error for ${event}:`, error);
        });
      })
      .catch((error) => {
        console.error(`[NATS] Failed to subscribe to ${event}:`, error);
      });
  }

  /**
   * Close the NATS connection and clean up subscriptions.
   */
  async close(): Promise<void> {
    // Drain all subscriptions
    for (const [key, subscription] of this.subscriptions) {
      try {
        subscription.unsubscribe();
      } catch (error) {
        console.error(`[NATS] Error unsubscribing from ${key}:`, error);
      }
    }
    this.subscriptions.clear();

    // Close connection
    if (this.connection) {
      try {
        await this.connection.drain();
        await this.connection.close();
        this.connection = undefined;
      } catch (error) {
        console.error("[NATS] Error closing connection:", error);
      }
    }
  }

  /**
   * Check if the NATS connection is established.
   * @returns True if connected, false otherwise
   */
  isConnected(): boolean {
    return this.connection !== undefined && !this.connection.isClosed();
  }

  /**
   * Get connection statistics.
   * @returns Connection stats or null if not connected
   */
  getStats() {
    if (!this.connection) return null;
    return this.connection.stats();
  }
}

// Re-export types for convenience
export type { Broker, Delivery } from "../../../core/src/index.js";
