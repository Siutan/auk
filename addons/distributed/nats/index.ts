/** biome-ignore-all lint/suspicious/noExplicitAny: <the payload data types are not known by the plugin> */
import {
  AckPolicy,
  type ConnectionOptions,
  type Consumer,
  connect,
  DeliverPolicy,
  type JetStreamClient,
  type JetStreamManager,
  type JetStreamSubscription,
  JSONCodec,
  type NatsConnection,
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
 * Hook runner function type for lifecycle hooks.
 */
export type HookRunner = <K extends string>(
  hook: K,
  opts: any
) => Promise<void>;

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
  /**
   * Hook runner function for lifecycle hooks.
   */
  runHook?: HookRunner;
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
    Subscription | JetStreamSubscription | Consumer
  >();
  private dlqEnabled: boolean;
  private dlqConfig: Required<DLQConfig>;
  private registeredStreams = new Set<string>();
  private eventListeners = new Map<
    string,
    { handler: (data: any) => void; delivery?: Delivery }
  >();
  private runHook?: HookRunner;

  constructor(private options: NATSMiddlewareOptions = {}) {
    this.dlqEnabled = options.dlq?.enabled ?? false;
    this.dlqConfig = {
      enabled: this.dlqEnabled,
      maxDeliver: options.dlq?.maxDeliver ?? 3,
      streamSuffix: options.dlq?.streamSuffix ?? ".DLQ",
      consumerName: options.dlq?.consumerName ?? "auk-dlq-consumer",
      autoCreateStreams: options.dlq?.autoCreateStreams ?? true,
    };
    this.runHook = options.runHook;
  }

  /**
   * Ensure connection is established.
   */
  async connect(): Promise<NatsConnection> {
    if (!this.connection) {
      try {
        // Call onBrokerConnect hook before connecting
        if (this.runHook) {
          await this.runHook("onBrokerConnect", {
            brokerType: "NATS",
            servers: this.options.servers,
          }).catch((error) => {
            console.error("[NATS] onBrokerConnect hook failed:", error);
          });
        }

        this.connection = await connect(this.options);
        if (this.dlqEnabled) {
          this.js = this.connection.jetstream();
        }

        // Call onBrokerConnected hook after successful connection
        if (this.runHook) {
          await this.runHook("onBrokerConnected", {
            brokerType: "NATS",
            servers: this.options.servers,
            dlqEnabled: this.dlqEnabled,
          }).catch((error) => {
            console.error("[NATS] onBrokerConnected hook failed:", error);
          });
        }
      } catch (error) {
        // Call onBrokerError hook on connection failure
        if (this.runHook) {
          await this.runHook("onBrokerError", {
            brokerType: "NATS",
            operation: "connect",
            error,
          }).catch((hookError) => {
            console.error("[NATS] onBrokerError hook failed:", hookError);
          });
        }
        throw error;
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
   * Convert event name to valid stream name (replace dots with underscores)
   */
  private getStreamName(event: string): string {
    return event.replace(/\./g, '_');
  }

  /**
   * Register a stream for an event if not already registered.
   */
  private async registerStream(event: string): Promise<void> {
    if (this.registeredStreams.has(event)) return;

    const streamName = this.getStreamName(event);

    // Call onBrokerStreamRegister hook before registering
    if (this.runHook) {
      await this.runHook("onBrokerStreamRegister", {
        brokerType: "NATS",
        streamName,
        eventName: event,
        autoCreateStreams: this.dlqConfig.autoCreateStreams,
      }).catch((error) => {
        console.error("[NATS] onBrokerStreamRegister hook failed:", error);
      });
    }

    // if autoCreateStreams is false, assume the stream already exists
    if (!this.dlqConfig.autoCreateStreams) {
      this.registeredStreams.add(event);

      // Call onBrokerStreamExists hook
      if (this.runHook) {
        await this.runHook("onBrokerStreamExists", {
          brokerType: "NATS",
          streamName,
          eventName: event,
        }).catch((error) => {
          console.error("[NATS] onBrokerStreamExists hook failed:", error);
        });
      }

      return;
    }

    // register the jetstreamManager if not already created
    if (!this.jsm) {
      const js = await this.ensureJetStream();
      this.jsm = await js.jetstreamManager();
    }

    // Create stream if not already created
    const streamConfig: Partial<StreamConfig> = {
      name: streamName,
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

      // Call onBrokerStreamCreated hook after successful creation
      if (this.runHook) {
        await this.runHook("onBrokerStreamCreated", {
          brokerType: "NATS",
          streamName,
          eventName: event,
          streamConfig,
        }).catch((hookError) => {
          console.error("[NATS] onBrokerStreamCreated hook failed:", hookError);
        });
      }
    } catch (error) {
      console.error(error);

      // Call onBrokerError hook on stream creation failure
      if (this.runHook) {
        await this.runHook("onBrokerError", {
          brokerType: "NATS",
          operation: "stream_creation",
          streamName,
          eventName: event,
          error,
        }).catch((hookError) => {
          console.error("[NATS] onBrokerError hook failed:", hookError);
        });
      }
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
    const dlqStreamName = `${this.getStreamName(event)}${this.dlqConfig.streamSuffix}`;

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

    // Call onBrokerSubscribe hook before subscribing
    if (this.runHook) {
      await this.runHook("onBrokerSubscribe", {
        brokerType: "NATS",
        eventName: event,
        delivery: opts?.delivery,
      }).catch((error) => {
        console.error("[NATS] onBrokerSubscribe hook failed:", error);
      });
    }

    await this.connect();
    await this.registerStream(event);

    const queueGroup = opts?.delivery === "queue" ? `auk-${this.getStreamName(event)}` : undefined;
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
        max_deliver: this.dlqConfig.maxDeliver,
      };

      console.log(
        `[NATS] Creating JetStream consumer for event: ${event} with queue: ${queueGroup}`
      );
      
      // Create or get the consumer using the modern API
      const streamName = this.getStreamName(event);
      const jsm = await this.connection!.jetstreamManager();
      
      // Try to create consumer, if it exists, just get it
      try {
        await jsm.consumers.add(streamName, consumerConfig);
      } catch (error: any) {
        // If consumer already exists, that's fine - we'll just use it
        if (error.api_error?.err_code !== 10148) {
          throw error;
        }
      }
      
      const consumer = await js.consumers.get(streamName, queueGroup);

      this.subscriptions.set(subscriptionKey, consumer);

      // Process messages with DLQ support using modern consumer API
      (async () => {
        // Use consume() for continuous message processing
        const messages = await consumer.consume({ max_messages: 1000 });
        
        // Process messages as they arrive
        for await (const message of messages) {
          const data = this.codec.decode(message.data);

          // Call onBrokerMessageReceived hook
          if (this.runHook) {
            await this.runHook("onBrokerMessageReceived", {
              brokerType: "NATS",
              eventName: event,
              payload: data,
              attemptCount: message.info.redeliveryCount,
              delivery: opts?.delivery,
            }).catch((error) => {
              console.error(
                "[NATS] onBrokerMessageReceived hook failed:",
                error
              );
            });
          }

          try {
            await handler(data);
            message.ack();

            // Call onBrokerMessageProcessed hook on success
            if (this.runHook) {
              await this.runHook("onBrokerMessageProcessed", {
                brokerType: "NATS",
                eventName: event,
                payload: data,
                attemptCount: message.info.redeliveryCount,
              }).catch((error) => {
                console.error(
                  "[NATS] onBrokerMessageProcessed hook failed:",
                  error
                );
              });
            }
          } catch (error) {
            // Call onBrokerMessageError hook
            if (this.runHook) {
              await this.runHook("onBrokerMessageError", {
                brokerType: "NATS",
                eventName: event,
                payload: data,
                error,
                attemptCount: message.info.redeliveryCount,
                maxAttempts: this.dlqConfig.maxDeliver,
              }).catch((hookError) => {
                console.error(
                  "[NATS] onBrokerMessageError hook failed:",
                  hookError
                );
              });
            }

            // Handle DLQ logic
            if (
              this.dlqEnabled &&
              message.info.redeliveryCount >= this.dlqConfig.maxDeliver
            ) {
              const dlqMetadata: DLQMessageMetadata = {
                originalEvent: event,
                originalData: data,
                attemptCount: message.info.redeliveryCount,
                timestamp: Date.now(),
                error: error instanceof Error ? error.message : String(error),
              };

              // Call onBrokerDLQ hook before sending to DLQ
              if (this.runHook) {
                await this.runHook("onBrokerDLQ", {
                  brokerType: "NATS",
                  eventName: event,
                  dlqMetadata,
                }).catch((hookError) => {
                  console.error("[NATS] onBrokerDLQ hook failed:", hookError);
                });
              }

              await this.publishToDLQ(event, dlqMetadata);
              message.ack(); // Acknowledge to prevent infinite redelivery
            } else {
              // Call onBrokerRetry hook before retry
              if (this.runHook) {
                await this.runHook("onBrokerRetry", {
                  brokerType: "NATS",
                  eventName: event,
                  payload: data,
                  attemptCount: message.info.redeliveryCount,
                  maxAttempts: this.dlqConfig.maxDeliver,
                  error,
                }).catch((hookError) => {
                  console.error("[NATS] onBrokerRetry hook failed:", hookError);
                });
              }

              message.nak(); // Negative acknowledgment for retry
            }
          }
        }
      })().catch((error) => {
        console.error(`[NATS] Subscription error for ${event}:`, error);

        // Call onBrokerError hook for subscription errors
        if (this.runHook) {
          this.runHook("onBrokerError", {
            brokerType: "NATS",
            operation: "subscription",
            eventName: event,
            error,
          }).catch((hookError) => {
            console.error("[NATS] onBrokerError hook failed:", hookError);
          });
        }
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
          const data = this.codec.decode(message.data);

          // Call onBrokerMessageReceived hook
          if (this.runHook) {
            await this.runHook("onBrokerMessageReceived", {
              brokerType: "NATS",
              eventName: event,
              payload: data,
              attemptCount: 1,
              delivery: opts?.delivery,
            }).catch((error) => {
              console.error(
                "[NATS] onBrokerMessageReceived hook failed:",
                error
              );
            });
          }

          try {
            await handler(data);

            // Call onBrokerMessageProcessed hook on success
            if (this.runHook) {
              await this.runHook("onBrokerMessageProcessed", {
                brokerType: "NATS",
                eventName: event,
                payload: data,
                attemptCount: 1,
              }).catch((error) => {
                console.error(
                  "[NATS] onBrokerMessageProcessed hook failed:",
                  error
                );
              });
            }
          } catch (error) {
            console.error(
              `[NATS] Error processing message for ${event}:`,
              error
            );

            // Call onBrokerMessageError hook
            if (this.runHook) {
              await this.runHook("onBrokerMessageError", {
                brokerType: "NATS",
                eventName: event,
                payload: data,
                error,
                attemptCount: 1,
                maxAttempts: 1,
              }).catch((hookError) => {
                console.error(
                  "[NATS] onBrokerMessageError hook failed:",
                  hookError
                );
              });
            }
          }
        }
      })().catch((error) => {
        console.error(`[NATS] Subscription error for ${event}:`, error);

        // Call onBrokerError hook for subscription errors
        if (this.runHook) {
          this.runHook("onBrokerError", {
            brokerType: "NATS",
            operation: "subscription",
            eventName: event,
            error,
          }).catch((hookError) => {
            console.error("[NATS] onBrokerError hook failed:", hookError);
          });
        }
      });
    }
  }

  /**
   * Publish an event.
   */
  async publish(event: string, data: any): Promise<void> {
    // Call onBrokerPublish hook before publishing
    if (this.runHook) {
      await this.runHook("onBrokerPublish", {
        brokerType: "NATS",
        eventName: event,
        payload: data,
        dlqEnabled: this.dlqEnabled,
      }).catch((error) => {
        console.error("[NATS] onBrokerPublish hook failed:", error);
      });
    }

    try {
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

      // Call onBrokerPublished hook after successful publish
      if (this.runHook) {
        await this.runHook("onBrokerPublished", {
          brokerType: "NATS",
          eventName: event,
          payload: data,
        }).catch((error) => {
          console.error("[NATS] onBrokerPublished hook failed:", error);
        });
      }
    } catch (error) {
      // Call onBrokerError hook on publish failure
      if (this.runHook) {
        await this.runHook("onBrokerError", {
          brokerType: "NATS",
          operation: "publish",
          eventName: event,
          payload: data,
          error,
        }).catch((hookError) => {
          console.error("[NATS] onBrokerError hook failed:", hookError);
        });
      }
      throw error;
    }
  }

  /**
   * Close connections and clean up.
   */
  async close(): Promise<void> {
    // Call onBrokerClose hook before closing
    if (this.runHook) {
      await this.runHook("onBrokerClose", {
        brokerType: "NATS",
        subscriptionCount: this.subscriptions.size,
      }).catch((error) => {
        console.error("[NATS] onBrokerClose hook failed:", error);
      });
    }

    try {
      for (const [key, subscription] of this.subscriptions) {
        try {
          if (typeof (subscription as any).unsubscribe === 'function') {
            (subscription as any).unsubscribe();
          } else if (typeof (subscription as any).stop === 'function') {
            // Consumer type - stop consuming
            (subscription as any).stop();
          }
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

      // Call onBrokerClosed hook after successful close
      if (this.runHook) {
        await this.runHook("onBrokerClosed", {
          brokerType: "NATS",
        }).catch((error) => {
          console.error("[NATS] onBrokerClosed hook failed:", error);
        });
      }
    } catch (error) {
      // Call onBrokerError hook on close failure
      if (this.runHook) {
        await this.runHook("onBrokerError", {
          brokerType: "NATS",
          operation: "close",
          error,
        }).catch((hookError) => {
          console.error("[NATS] onBrokerError hook failed:", hookError);
        });
      }
      throw error;
    }
  }
}

// Re-export types for convenience
export type { Delivery } from "../../../core/src/index.js";
