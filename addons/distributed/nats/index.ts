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
  AdvancedMiddlewareFn,
  AukEvent,
  Delivery,
  DLQMessageMetadata,
  MessageMetadata,
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
class NATSMiddleware {
  private connection?: NatsConnection;
  private js?: JetStreamClient;
  private jsm?: JetStreamManager;
  private codec = JSONCodec();
  private subscriptions = new Map<
    string,
    Subscription | JetStreamSubscription
  >();
  private options: NATSMiddlewareOptions;
  private dlqEnabled: boolean;
  private dlqConfig: Required<DLQConfig>;
  private registeredStreams = new Set<string>();
  private eventListeners = new Map<
    string,
    { handler: (data: any) => void; delivery?: Delivery }
  >();
  private middlewareContext?: any; // Store middleware context instead of using globals

  constructor(options: NATSMiddlewareOptions = {}) {
    this.options = options;
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
   * Set the middleware context for lifecycle hooks.
   * This replaces the global context approach with explicit context passing.
   */
  setMiddlewareContext(context: any): void {
    this.middlewareContext = context;
  }

  /**
   * Ensure connection is established.
   */
  async ensureConnection(): Promise<NatsConnection> {
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
      await this.ensureConnection();
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
  private async setupSubscription(
    event: string,
    handler: (data: any) => void,
    delivery?: Delivery
  ): Promise<void> {
    await this.ensureConnection();
    await this.registerStream(event);

    const queueGroup = delivery === "queue" ? `auk-${event}` : undefined;
    const subscriptionKey = `${event}-${queueGroup || "broadcast"}`;

    if (this.subscriptions.has(subscriptionKey)) {
      return; // Already subscribed
    }

    if (this.dlqEnabled) {
      const js = await this.ensureJetStream();

      const subscription = await js.subscribe(event, {
        queue: queueGroup,
        config: {
          ack_policy: AckPolicy.Explicit,
          deliver_policy: DeliverPolicy.All,
          replay_policy: ReplayPolicy.Instant,
          max_deliver: this.dlqConfig.maxDeliver,
          ack_wait: 30 * 1000000000, // 30 seconds in nanoseconds
        },
      });

      this.subscriptions.set(subscriptionKey, subscription);

      // Process messages with DLQ support
      (async () => {
        for await (const message of subscription) {
          const metadata: MessageMetadata = {
            attemptCount: message.info?.redeliveryCount || 0,
            timestamp: Date.now(),
            messageId:
              message.headers?.get("messageId") || `${event}-${Date.now()}`,
            delivery,
          };

          try {
            const data = this.codec.decode(message.data);
            const eventObj: AukEvent = { event, data };

            // Fire hooks via context if available
            if (this.middlewareContext?.hooks?.onReceived) {
              await this.middlewareContext.hooks.onReceived(eventObj, metadata);
            }

            handler(data);
            message.ack();

            if (this.middlewareContext?.hooks?.onSuccess) {
              await this.middlewareContext.hooks.onSuccess(eventObj, metadata);
            }
          } catch (error) {
            const eventObj: AukEvent = {
              event,
              data: this.codec.decode(message.data),
            };
            if (this.middlewareContext?.hooks?.onFailed) {
              await this.middlewareContext.hooks.onFailed(
                eventObj,
                error as Error,
                metadata
              );
            }

            // Handle DLQ logic
            if (
              this.dlqEnabled &&
              metadata.attemptCount >= this.dlqConfig.maxDeliver - 1
            ) {
              const dlqMetadata: DLQMessageMetadata = {
                originalEvent: event,
                originalData: this.codec.decode(message.data),
                attemptCount: metadata.attemptCount,
                timestamp: Date.now(),
                error: error instanceof Error ? error.message : String(error),
              };

              await this.publishToDLQ(event, dlqMetadata);
              message.ack(); // Acknowledge to prevent infinite redelivery

              if (this.middlewareContext?.hooks?.onDLQ) {
                await this.middlewareContext.hooks.onDLQ(eventObj, dlqMetadata);
              }
            } else {
              if (this.middlewareContext?.hooks?.onRetry) {
                await this.middlewareContext.hooks.onRetry(
                  eventObj,
                  metadata.attemptCount + 1,
                  metadata
                );
              }
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
    await this.ensureConnection();
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
   * Subscribe to an event.
   */
  subscribe(
    event: string,
    handler: (data: any) => void,
    delivery?: Delivery
  ): void {
    this.eventListeners.set(event, { handler, delivery });
    this.setupSubscription(event, handler, delivery).catch((error) => {
      console.error(`[NATS] Failed to subscribe to ${event}:`, error);
    });
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

/**
 * Create NATS middleware function.
 * @param options - NATS middleware options
 * @returns Advanced middleware function
 */
export function natsMiddleware(
  options: NATSMiddlewareOptions = {}
): AdvancedMiddlewareFn {
  const nats = new NATSMiddleware(options);
  let isInitialized = false;

  return async (event: AukEvent, context, next) => {
    // Store context in the NATS instance for subscription handlers
    nats.setMiddlewareContext(context);

    if (!isInitialized) {
      // Initialize NATS connection on first use
      await nats.ensureConnection();
      isInitialized = true;

      // Register cleanup handler using explicit context passing
      context.addCleanupHandler("nats-middleware", () => nats.close());
    }

    // Handle outgoing events (publishing)
    if (context.isDistributed) {
      await nats.publish(event.event, event.data);
    }

    // Continue to next middleware
    return await next();
  };
}

// Convenience function to register event listeners through middleware
export function createNATSEventBus(options: NATSMiddlewareOptions = {}) {
  const nats = new NATSMiddleware(options);

  return {
    subscribe: (
      event: string,
      handler: (data: any) => void,
      delivery?: Delivery
    ) => {
      nats.subscribe(event, handler, delivery);
    },
    close: () => nats.close(),
  };
}

// Re-export types for convenience
export type { Delivery } from "../../../core/src/index.js";
