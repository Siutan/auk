import type { TSchema } from "@sinclair/typebox";
import type { DLQMessageMetadata } from "./broker.js";
import type { AukContext } from "./config.js";
import type { ProducerBuilderHandler } from "./producer-builder.js";
import type { TriggerSource } from "./triggers.js";
import type { AukEvent, Delivery } from "./types.js";

/**
 * Message metadata for lifecycle hooks.
 */
export interface MessageMetadata {
  /**
   * Unique message ID.
   */
  messageId?: string;
  /**
   * Delivery attempt count.
   */
  attemptCount: number;
  /**
   * Message timestamp.
   */
  timestamp: number;
  /**
   * Delivery mode.
   */
  delivery?: Delivery;
  /**
   * Additional metadata.
   */
  [key: string]: any;
}

/**
 * Legacy lifecycle hook function signatures for backward compatibility.
 * @deprecated Use AukMiddleware instead for comprehensive lifecycle management
 */
export interface LifecycleHooks {
  /**
   * Called when a message is received.
   */
  onReceived?: (
    event: AukEvent,
    metadata: MessageMetadata
  ) => void | Promise<void>;
  /**
   * Called when message processing fails.
   */
  onFailed?: (
    event: AukEvent,
    error: Error,
    metadata: MessageMetadata
  ) => void | Promise<void>;
  /**
   * Called when a message is being retried.
   */
  onRetry?: (
    event: AukEvent,
    attemptNumber: number,
    metadata: MessageMetadata
  ) => void | Promise<void>;
  /**
   * Called when message processing succeeds.
   */
  onSuccess?: (
    event: AukEvent,
    metadata: MessageMetadata
  ) => void | Promise<void>;
  /**
   * Called when a message is sent to DLQ.
   */
  onDLQ?: (
    event: AukEvent,
    metadata: DLQMessageMetadata
  ) => void | Promise<void>;
  /**
   * Called when an event is about to be dispatched to consumers.
   */
  onEventDispatch?: (
    event: AukEvent,
    metadata: MessageMetadata
  ) => void | Promise<void>;
}

/**
 * Consumer handler function type for middleware hooks.
 */
export type ConsumerHandler<T = any, Context extends AukContext = AukContext> = (
  payload: T,
  ctx: Context
) => void | Promise<void>;

/**
 * Comprehensive middleware interface for Auk lifecycle management.
 * Provides hooks at every stage of the event-driven lifecycle for monitoring,
 * logging, metrics, error handling, and custom business logic.
 * 
 * @template Events - The event schemas object
 */
export interface AukMiddleware<Events extends Record<string, TSchema> = Record<string, TSchema>> {
  /**
   * Called when Auk instance is initialized.
   * Use for setup tasks like connecting to databases, initializing metrics, etc.
   */
  onAukInit?: (opts: {
    auk: any; // Auk<Events> - using any to avoid circular dependency
  }) => void | Promise<void>;

  /**
   * Called when Auk instance starts up.
   * Use for final initialization tasks before processing begins.
   */
  onAukStart?: (opts: {
    auk: any; // Auk<Events> - using any to avoid circular dependency
  }) => void | Promise<void>;

  /**
   * Called when a producer is registered.
   * Use for tracking producer registration, validation, or setup.
   */
  onProducerRegistered?: (opts: {
    auk: any; // Auk<Events> - using any to avoid circular dependency
    eventName: keyof Events;
    builder: any; // ProducerBuilder - using any to avoid circular dependency
  }) => void | Promise<void>;

  /**
   * Called when a trigger source is attached to a producer.
   * Use for monitoring trigger configuration and setup.
   */
  onSourceAttached?: (opts: {
    eventName: keyof Events;
    source: TriggerSource<any>;
  }) => void | Promise<void>;

  /**
   * Called when a handler is attached to a producer.
   * Use for handler validation, wrapping, or instrumentation.
   */
  onHandlerAttached?: (opts: {
    eventName: keyof Events;
    handler: ProducerBuilderHandler<any, any, any>;
  }) => void | Promise<void>;

  /**
   * Called when an event is produced (before dispatch).
   * Use for logging, metrics, validation, or event enrichment.
   */
  onEventProduced?: (opts: {
    eventName: keyof Events;
    payload: any;
    ctx: AukContext;
  }) => void | Promise<void>;

  /**
   * Called when event production fails.
   * Use for error logging, dead letter queues, or alerting.
   */
  onProduceError?: (opts: {
    eventName: keyof Events;
    payload: any;
    error: Error;
    ctx: AukContext;
  }) => void | Promise<void>;

  /**
   * Called when an event is about to be dispatched to consumers.
   * Use for routing decisions, load balancing, or dispatch monitoring.
   */
  onEventDispatch?: (opts: {
    eventName: keyof Events;
    payload: any;
    consumers: ConsumerHandler<any, any>[];
  }) => void | Promise<void>;

  /**
   * Called when an event is consumed by a specific consumer.
   * Use for consumer-specific logging, metrics, or processing.
   */
  onEventConsumed?: (opts: {
    eventName: keyof Events;
    payload: any;
    consumer: ConsumerHandler<any, any>;
    ctx: AukContext;
  }) => void | Promise<void>;

  /**
   * Called when event consumption fails.
   * Use for error handling, retry logic, or consumer health monitoring.
   */
  onConsumeError?: (opts: {
    eventName: keyof Events;
    payload: any;
    error: Error;
    ctx: AukContext;
    consumer: ConsumerHandler<any, any>;
  }) => void | Promise<void>;

  /**
   * Called when Auk instance is stopping.
   * Use for cleanup tasks, connection closing, or final metrics reporting.
   */
  onAukStop?: (opts: {
    auk: any; // Auk<Events> - using any to avoid circular dependency
  }) => void | Promise<void>;

  /**
   * Called when a consumer is registered.
   * Use for consumer validation, setup, or registration tracking.
   */
  onConsumerRegistered?: (opts: {
    eventName: keyof Events;
    consumer: ConsumerHandler<any, any>;
    delivery?: Delivery;
  }) => void | Promise<void>;

  /**
   * Called when a trigger source starts listening.
   * Use for monitoring trigger activation and health.
   */
  onTriggerStart?: (opts: {
    eventName: keyof Events;
    source: TriggerSource<any>;
  }) => void | Promise<void>;

  /**
   * Called when a trigger source stops listening.
   * Use for cleanup and monitoring trigger deactivation.
   */
  onTriggerStop?: (opts: {
    eventName: keyof Events;
    source: TriggerSource<any>;
  }) => void | Promise<void>;

  /**
   * Called when a retry attempt is made.
   * Use for retry monitoring, backoff strategies, or failure analysis.
   */
  onRetryAttempt?: (opts: {
    eventName: keyof Events;
    payload: any;
    attemptNumber: number;
    maxAttempts: number;
    error: Error;
    ctx: AukContext;
  }) => void | Promise<void>;

  /**
   * Called when all retry attempts are exhausted.
   * Use for dead letter queue handling or final error processing.
   */
  onRetryExhausted?: (opts: {
    eventName: keyof Events;
    payload: any;
    totalAttempts: number;
    finalError: Error;
    ctx: AukContext;
  }) => void | Promise<void>;
}
