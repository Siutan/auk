import type { AukEvent, Delivery } from "./types.js";
import type { DLQMessageMetadata } from "./broker.js";

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
 * Lifecycle hook function signatures.
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
}
