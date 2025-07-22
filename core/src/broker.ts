import type { Delivery } from "./types.js";

/**
 * DLQ message metadata for failed message tracking.
 */
export interface DLQMessageMetadata {
  /**
   * Original event name that failed.
   */
  originalEvent: string;
  /**
   * Original message data that failed.
   */
  originalData: any;
  /**
   * Number of delivery attempts before failure.
   */
  attemptCount: number;
  /**
   * Timestamp when the message was sent to DLQ.
   */
  timestamp: number;
  /**
   * Error message that caused the failure.
   */
  error?: string;
}

/**
 * DLQ handler function signature.
 */
export type DLQHandler = (metadata: DLQMessageMetadata) => void | Promise<void>;

/**
 * Extended broker interface with DLQ support.
 */
export interface Broker {
  /**
   * Publish an event to the broker.
   * @param event - The event name
   * @param data - The event data
   * @returns Promise that resolves when the event is published
   */
  publish(event: string, data: any): Promise<void>;

  /**
   * Subscribe to an event from the broker.
   * @param event - The event name
   * @param handler - The handler function
   * @param opts - Optional delivery configuration
   */
  subscribe(
    event: string,
    handler: (data: any) => void,
    opts?: { delivery?: Delivery }
  ): void;

  /**
   * Close the broker connection.
   * @returns Promise that resolves when the broker is closed
   */
  close(): Promise<void>;

  /**
   * Check if DLQ is enabled for this broker.
   * @returns True if DLQ is enabled, false otherwise
   */
  isDLQEnabled?(): boolean;

  /**
   * Subscribe to DLQ messages for an event.
   * @param event - The event name
   * @param handler - The handler function for DLQ messages
   */
  subscribeToDLQ?(event: string, handler: DLQHandler): Promise<void>;

  /**
   * Get DLQ messages for an event.
   * @param event - The event name
   * @param limit - Maximum number of messages to retrieve
   * @returns Array of DLQ message metadata
   */
  getDLQMessages?(event: string, limit?: number): Promise<DLQMessageMetadata[]>;
}
