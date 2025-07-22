import type { AukEvent, Delivery, CleanupFn } from "./types.js";
import type { MessageMetadata, LifecycleHooks } from "./lifecycle.js";

/**
 * Middleware function signature for event processing.
 */
export type MiddlewareFn = (event: AukEvent) => AukEvent | Promise<AukEvent>;

/**
 * Middleware context for advanced middleware functions.
 */
export interface MiddlewareContext {
  metadata: MessageMetadata;
  hooks: LifecycleHooks;
  delivery?: Delivery;
  isDistributed: boolean;
  state: Record<string, any>;
  set: (key: string, value: any) => void;
  get: (key: string) => any;
  /**
   * Register a cleanup handler that will be called during shutdown.
   * This provides a way for middleware to register cleanup without global state.
   */
  addCleanupHandler: (name: string, fn: CleanupFn) => void;
}

/**
 * Advanced middleware function with context and next capability.
 */
export type AdvancedMiddlewareFn = (
  event: AukEvent,
  context: MiddlewareContext,
  next: () => Promise<AukEvent>
) => Promise<AukEvent>;
