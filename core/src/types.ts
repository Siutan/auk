import type { Static, TSchema } from "@sinclair/typebox";

/**
 * Delivery mode for distributed events.
 */
export type Delivery = "queue" | "broadcast";

/**
 * Auk mode - local or distributed.
 */
export type AukMode = "local" | "distributed";

/**
 * Event schemas type definition for tracking event schemas and their types.
 */
export type EventSchemas = Record<string, TSchema>;

/**
 * Utility type to merge event schemas without deep type instantiation.
 * This merges two event schema objects, with the second taking precedence.
 */
export type MergeEventSchemas<
  A extends EventSchemas,
  B extends EventSchemas
> = {
  [K in keyof A | keyof B]: K extends keyof B
    ? B[K]
    : K extends keyof A
    ? A[K]
    : never;
};

/**
 * Extract event data types from event schemas.
 */
export type EventPayloads<S extends EventSchemas> = {
  [K in keyof S]: Static<S[K]>;
};

/**
 * Type representing the event name.
 */
export type EventType = string;

/**
 * Type representing the event data.
 */
export type EventData = AukEvent["data"];

/**
 * Represents an event object for AukBus.
 * @template T - The type of the event data.
 */
export interface AukEvent<T = unknown> {
  /**
   * The event name.
   */
  event: string;
  /**
   * The event data payload.
   */
  data: T;
}

/**
 * Cleanup function signature for graceful shutdown.
 */
export type CleanupFn = () => Promise<void> | void;
