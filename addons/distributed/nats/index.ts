/** biome-ignore-all lint/suspicious/noExplicitAny: <the payload data types are not known by the plugin> */
import {
  AckPolicy,
  type ConnectionOptions,
  connect,
  DeliverPolicy,
  type JetStreamClient,
  type JetStreamManager,
  type JetStreamSubscription,
  JSONCodec,
  type NatsConnection,
  ReplayPolicy,
  RetentionPolicy,
  StorageType,
  type StreamConfig,
  type Subscription,
} from "nats";
import type {
  Broker,
  Delivery,
  DLQMessageMetadata,
} from "../../../core/src/index.js";

/**
 * DLQ configuration for JetStream.
 */
export interface DLQConfig {
  /**
   * Enable Dead Letter Queue functionality.
   */
  enabled: boolean;
  /**
   * Maximum number of delivery attempts before sending to DLQ.
   */
  maxDeliver?: number;
  /**
   * DLQ stream name suffix. Default: ".DLQ"
   */
  streamSuffix?: string;
  /**
   * Consumer name for DLQ processing.
   */
  consumerName?: string;
  /**
   * Auto-create streams if they don't exist.
   */
  autoCreateStreams?: boolean;
}

/**
 * NATS middleware options.
 */
export interface NATSMiddlewareOptions extends ConnectionOptions {
  /**
   * NATS server URL(s).
   */
  servers?: string | string[];
  /**
   * Dead Letter Queue configuration.
   */
  dlq?: DLQConfig;
  /**
   * Auto-register streams for all events.
   */
  autoRegisterStreams?: boolean;
}

/**
 * NATS middleware class that handles distributed messaging.
 */
export class NatsBroker implements Broker {
  private connection?: NatsConnection;
  private js?: JetStreamClient;
  private jsm?: JetStreamManager;
  private codec = JSONCodec();
  private subscriptions = new Map<
    string,
    Subscription | JetStreamSubscription
  >();
  private dlqEnabled: boolean;
  private dlqConfig: Required<DLQConfig>;
  private registeredStreams = new Set<string>();
  private eventListeners = new Map<
    string,
    { handler: (data: any) => void; delivery?: Delivery }
  >();

  constructor(private options: NATSMiddlewareOptions = {}) {
    this.dlqEnabled = options.dlq?.enabled ?? false;
    this.dlqConfig = {
      enabled: this.dlqEnabled,
      maxDeliver: options.dlq?.maxDeliver ?? 3,
      streamSuffix: options.dlq?.streamSuffix ?? ".DLQ",
      consumerName: options.dlq?.consumerName ?? "auk-dlq-consumer",
      autoCreateStreams: options.dlq?.autoCreateStreams ?? true,
    };
  }

  /**
   * Ensure connection is established.
   */
  async connect(): Promise<NatsConnection> {
    if (!this.connection) {
      this.connection = await connect(this.options);
      if (this.dlqEnabled) {
        this.js = this.connection.jetstream();
      }
    }
    return this.connection;
  }

  /**
   * Ensure JetStream client is available.
   */
  private async ensureJetStream(): Promise<JetStreamClient> {
    if (!this.js) {
      await this.connect();
      if (!this.js) {
        throw new Error("JetStream is not available");
      }
    }
    return this.js;
  }

  /**
   * Register a stream for an event if not already registered.
   */
  private async registerStream(event: string): Promise<void> {
    if (this.registeredStreams.has(event)) return;

    // if autoCreateStreams is false, assume the stream already exists
    if (!this.dlqConfig.autoCreateStreams) {
      this.registeredStreams.add(event);
      return;
    }

    // register the jetstreamManager if not already created
    if (!this.jsm) {
      const js = await this.ensureJetStream();
      this.jsm = await js.jetstreamManager();
    }

    // Create stream if not already created
    const streamConfig: Partial<StreamConfig> = {
      name: event,
      subjects: [event],
      storage: StorageType.File, // or "memory"
      retention: RetentionPolicy.Limits,
      max_msgs: 1000,
      max_bytes: 10 * 1024 * 1024, // 10MB
      // TODO: investigate why max_age breaks everything
      // max_age: 60 * 60 * 10000 // 10 hours
    };

    // create the stream if not already created
    try {
      await this.jsm.streams.add(streamConfig);
    } catch (error) {
      console.error(error);
    }
  }

  /**
   * Publish to DLQ.
   */
  private async publishToDLQ(
    event: string,
    metadata: DLQMessageMetadata
  ): Promise<void> {
    if (!this.dlqEnabled) return;

    const js = await this.ensureJetStream();
    const dlqStreamName = `${event}${this.dlqConfig.streamSuffix}`;

    const encodedData = this.codec.encode(metadata);
    await js.publish(dlqStreamName, encodedData);
  }

  /**
   * Set up subscription for an event with DLQ support.
   */
  async subscribe(
    event: string,
    handler: (data: any) => void,
    opts?: { delivery?: Delivery }
  ): Promise<void> {
    console.log(`[NATS] Subscribing to event: ${event} with options:`, opts);
    await this.connect();
    await this.registerStream(event);

    const queueGroup = opts?.delivery === "queue" ? `auk-${event}` : undefined;
    const subscriptionKey = `${event}-${queueGroup || "broadcast"}`;

    if (this.subscriptions.has(subscriptionKey)) {
      return; // Already subscribed
    }

    if (this.dlqEnabled) {
      const js = await this.ensureJetStream();

      const consumerConfig = {
        durable_name: queueGroup,
        ack_policy: AckPolicy.Explicit,
        deliver_policy: DeliverPolicy.New, // Only deliver new messages
        max_deliver: this.dlqConfig.maxDeliver
      };

      console.log(`[NATS] Creating JetStream subscription for event: ${event} with queue: ${queueGroup}`);
      const subscription = await js.subscribe(event, {
        queue: queueGroup,
        config: consumerConfig,
      });

      this.subscriptions.set(subscriptionKey, subscription);

      // Process messages with DLQ support
      (async () => {
        for await (const message of subscription) {
          try {
            const data = this.codec.decode(message.data);
            handler(data);
            message.ack();
          } catch (error) {
            // Handle DLQ logic
            if (
              this.dlqEnabled &&
              message.info.redeliveryCount >= this.dlqConfig.maxDeliver
            ) {
              const dlqMetadata: DLQMessageMetadata = {
                originalEvent: event,
                originalData: this.codec.decode(message.data),
                attemptCount: message.info.redeliveryCount,
                timestamp: Date.now(),
                error: error instanceof Error ? error.message : String(error),
              };
              await this.publishToDLQ(event, dlqMetadata);
              message.ack(); // Acknowledge to prevent infinite redelivery
            } else {
              message.nak(); // Negative acknowledgment for retry
            }
          }
        }
      })().catch((error) => {
        console.error(`[NATS] Subscription error for ${event}:`, error);
      });
    } else {
      // Regular NATS subscription without DLQ
      const subject = event;
      if (!this.connection) {
        throw new Error("NATS connection is not initialized");
      }
      const subscription = this.connection.subscribe(subject, {
        queue: queueGroup,
      });
      this.subscriptions.set(subscriptionKey, subscription);

      (async () => {
        for await (const message of subscription) {
          try {
            const data = this.codec.decode(message.data);
            await handler(data);
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
    }
  }

  /**
   * Publish an event.
   */
  async publish(event: string, data: any): Promise<void> {
    await this.connect();
    await this.registerStream(event);

    if (this.dlqEnabled) {
      const js = await this.ensureJetStream();
      const encodedData = this.codec.encode(data);
      await js.publish(event, encodedData);
    } else {
      const encodedData = this.codec.encode(data);
      if (!this.connection) {
        throw new Error("NATS connection is not initialized");
      }
      this.connection.publish(event, encodedData);
    }
  }



  /**
   * Close connections and clean up.
   */
  async close(): Promise<void> {
    for (const [key, subscription] of this.subscriptions) {
      try {
        subscription.unsubscribe();
      } catch (error) {
        console.error(`[NATS] Error unsubscribing from ${key}:`, error);
      }
    }
    this.subscriptions.clear();

    if (this.connection) {
      try {
        await this.connection.drain();
        await this.connection.close();
        this.connection = undefined;
        this.js = undefined;
      } catch (error) {
        console.error("[NATS] Error closing connection:", error);
      }
    }
  }
}



// Re-export types for convenience
export type { Delivery } from "../../../core/src/index.js";
