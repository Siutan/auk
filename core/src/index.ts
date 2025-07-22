/** biome-ignore-all lint/suspicious/noExplicitAny: <any is needed for type inference> */
/** biome-ignore-all lint/complexity/noBannedTypes: <{} is needed for type inference> */

import { EventEmitter as NodeEventEmitter } from "node:events";

// Re-export TypeBox for convenience
export { type Static, type TSchema, Type } from "@sinclair/typebox";

// Re-export middleware utilities
export * from "./middleware/index.js";

import type { Static, TSchema } from "@sinclair/typebox";

/**
 * Delivery mode for distributed events.
 */
export type Delivery = "queue" | "broadcast";

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

/**
 * Auk mode - local or distributed.
 */
export type AukMode = "local" | "distributed";

/**
 * Event schemas type definition for tracking event schemas and their types.
 */
type EventSchemas = Record<string, TSchema>;

/**
 * Utility type to merge event schemas without deep type instantiation.
 * This merges two event schema objects, with the second taking precedence.
 */
type MergeEventSchemas<A extends EventSchemas, B extends EventSchemas> = {
  [K in keyof A | keyof B]: K extends keyof B
    ? B[K]
    : K extends keyof A
    ? A[K]
    : never;
};

/**
 * Extract event data types from event schemas.
 */
type EventPayloads<S extends EventSchemas> = {
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

/**
 * Cleanup function signature for graceful shutdown.
 */
export type CleanupFn = () => Promise<void> | void;

/**
 * Health check status object.
 */
export interface HealthStatus {
  /**
   * Overall service health status.
   */
  status: "healthy" | "unhealthy";
  /**
   * Individual health checks by name.
   */
  checks: Record<string, boolean>;
}

/**
 * Configuration object for Auk service.
 */
export interface AukConfig {
  /**
   * Global environment object or string (e.g. process.env, Bun.env, or custom)
   */
  env: string;
  /**
   * Service name for identification in logs, monitoring, etc.
   * Defaults to 'auk-service'.
   */
  serviceName?: string;
  /**
   * Maximum number of event listeners for the event bus (0 = unlimited, default: 0)
   */
  maxEventListeners?: number;
  /**
   * Any other config fields can be added by the user
   */
  [key: string]: unknown;
}

/**
 * Context object passed to plugins and modules.
 */
export interface AukContext {
  /**
   * The resolved configuration object.
   */
  config: Required<AukConfig>;
  /**
   * Logger object for info, warn, error, and debug.
   */
  logger: {
    info: (...args: Parameters<typeof console.info>) => void;
    warn: (...args: Parameters<typeof console.info>) => void;
    error: (...args: Parameters<typeof console.info>) => void;
    debug: (...args: Parameters<typeof console.info>) => void;
  };
  /**
   * Health status object for service monitoring.
   */
  health: HealthStatus;
  /**
   * Register a cleanup handler for graceful shutdown.
   */
  addCleanupHandler: (name: string, fn: CleanupFn) => void;
  /**
   * Auto-cleanup version of setInterval that registers cleanup automatically.
   * @param callback - Function to execute repeatedly
   * @param delay - Delay in milliseconds
   * @returns Interval ID
   */
  setInterval: (callback: () => void, delay: number) => NodeJS.Timeout;
  /**
   * Auto-cleanup version of setTimeout that registers cleanup automatically.
   * @param callback - Function to execute after delay
   * @param delay - Delay in milliseconds
   * @returns Timeout ID
   */
  setTimeout: (callback: () => void, delay: number) => NodeJS.Timeout;
  /**
   * Any other context fields.
   */
  [key: string]: unknown;
}

/**
 * Plugin function signature.
 * Plugins are typically event PRODUCERS that emit events into the system.
 * They receive the bus first for consistent type safety with modules.
 * @param bus - The Auk event bus (typed for event emission constraints).
 * @param context - The Auk context object.
 * @returns A promise or void.
 */
export type PluginFn<S extends EventSchemas = {}> = (
  bus: AukBus<S>,
  context: AukContext
) => Promise<void> | void;

/**
 * Module function signature.
 * Modules are typically event CONSUMERS that listen to events in the system.
 * They receive the bus first to emphasize their role as event listeners.
 * @param bus - The Auk event bus.
 * @param context - The Auk context object.
 */
export type ModuleFn<S extends EventSchemas = {}> = (
  bus: AukBus<S>,
  context: AukContext
) => void;

/**
 * Named plugin object.
 */
export interface NamedPlugin<S extends EventSchemas = {}> {
  /**
   * Name of the plugin.
   */
  name: string;
  /**
   * Plugin function.
   */
  fn: PluginFn<S>;
  /**
   * Delivery mode for distributed events (only applies in distributed mode).
   */
  delivery?: Delivery;
}
/**
 * Named module object.
 */
export interface NamedModule<S extends EventSchemas = {}> {
  /**
   * Name of the module.
   */
  name: string;
  /**
   * Module function.
   */
  fn: ModuleFn<S>;
  /**
   * Delivery mode for distributed events (only applies in distributed mode).
   */
  delivery?: Delivery;
}

/**
 * Plugin with events that can define its own event schemas.
 */
export interface PluginWithEvents<
  S extends EventSchemas,
  E extends EventSchemas
> {
  /**
   * Name of the plugin.
   */
  name: string;
  /**
   * Event schemas that this plugin defines.
   */
  events: E;
  /**
   * Plugin function that receives a bus with merged event schemas.
   */
  fn: PluginFn<MergeEventSchemas<S, E>>;
  /**
   * Delivery mode for distributed events (only applies in distributed mode).
   */
  delivery?: Delivery;
}

/**
 * Type for plugin registration (named or function with optional name).
 */
export type AukPlugin<S extends EventSchemas = {}> =
  | NamedPlugin<S>
  | (PluginFn<S> & { name?: string });
/**
 * Type for module registration (named or function with optional name).
 */
export type AukModule<S extends EventSchemas = {}> =
  | NamedModule<S>
  | (ModuleFn<S> & { name?: string });

// Helpful type aliases that make the distinction clearer
/**
 * Alias for AukModule - emphasizes the role as event consumers/listeners.
 * Use this type when you want to be explicit about the module's purpose.
 */
export type EventConsumer<S extends EventSchemas = {}> = AukModule<S>;

/**
 * Alias for AukPlugin - emphasizes the role as event producers/emitters.
 * Use this type when you want to be explicit about the plugin's purpose.
 */
export type EventProducer<S extends EventSchemas = {}> = AukPlugin<S>;

/**
 * Helper function to create properly typed plugins.
 * This ensures the plugin function receives correctly typed bus and context parameters.
 */
export function plugin<S extends EventSchemas = {}>(config: {
  name: string;
  fn: PluginFn<S>;
  delivery?: Delivery;
}): NamedPlugin<S> {
  return config;
}

/**
 * Helper function to create properly typed modules.
 * This ensures the module function receives correctly typed bus and context parameters.
 */
export function module<S extends EventSchemas = {}>(config: {
  name: string;
  fn: ModuleFn<S>;
  delivery?: Delivery;
}): NamedModule<S> {
  return config;
}

/**
 * AukBus wraps EventEmitter to enforce event shape and provide type safety.
 */
export class AukBus<S extends EventSchemas = {}> {
  protected emitter: NodeEventEmitter;
  protected middlewares: MiddlewareFn[] = [];
  protected advancedMiddlewares: AdvancedMiddlewareFn[] = [];
  protected wildcardListeners: {
    pattern: string;
    listener: (data: EventData) => void;
    once?: boolean;
    regex?: RegExp;
  }[] = [];
  protected hasMiddleware = false;
  protected hasAdvancedMiddleware = false;
  protected eventSchemas: Partial<S> = {};
  protected mode: AukMode;
  protected broker?: Broker;
  protected lifecycleHooks: LifecycleHooks = {};
  protected cleanupHandlerRegistrar?: (name: string, fn: CleanupFn) => void;

  /**
   * Create a new AukBus instance.
   * @param emitter - Optional NodeEventEmitter instance.
   * @param maxListeners - Maximum number of event listeners (0 = unlimited)
   * @param mode - Operating mode (local or distributed)
   * @param broker - Broker instance for distributed mode
   * @param cleanupHandlerRegistrar - Function to register cleanup handlers
   */
  constructor(
    emitter?: NodeEventEmitter,
    maxListeners = 0,
    mode: AukMode = "local",
    broker?: Broker,
    cleanupHandlerRegistrar?: (name: string, fn: CleanupFn) => void
  ) {
    this.emitter = emitter || new NodeEventEmitter();
    this.emitter.setMaxListeners(maxListeners); // Allow unlimited listeners by default, or use config
    this.mode = mode;
    this.broker = broker;
    this.cleanupHandlerRegistrar = cleanupHandlerRegistrar;
  }

  /**
   * Compile a wildcard pattern into a regex for efficient matching.
   * @param pattern - The wildcard pattern
   * @returns Compiled regex pattern
   */
  private compilePattern(pattern: string): RegExp {
    if (pattern === "*") return /^.+$/;
    if (!pattern.includes("*"))
      return new RegExp(`^${pattern.replace(/\./g, "\\.")}$`);

    // Strict wildcard logic:
    // '*' matches exactly one segment (no dots)
    // '**' matches any number of segments (including dots)
    const regexPattern = pattern
      .replace(/\./g, "\\.") // Escape dots
      .replace(/\*\*/g, "___DOUBLE_WILDCARD___") // Temporary marker for '**'
      .replace(/\*/g, "[^.]+") // '*' matches one segment (no dot)
      .replace(/___DOUBLE_WILDCARD___/g, ".*"); // '**' matches any (including dots)

    return new RegExp(`^${regexPattern}$`);
  }

  /**
   * Check if a pattern contains wildcards.
   * @param pattern - The pattern to check
   * @returns True if the pattern contains wildcards
   */
  private isWildcardPattern(pattern: string): boolean {
    return pattern.includes("*");
  }

  /**
   * Define an event schema for type safety.
   * @param eventName - The event name
   * @param schema - The TypeBox schema for the event data
   * @returns A new AukBus instance with the event schema registered
   */
  event<EventName extends string, Schema extends TSchema>(
    eventName: EventName,
    schema: Schema
  ): AukBus<S & Record<EventName, Schema>> {
    // Create a truly new bus instance with augmented types
    const newBus = new AukBus<S & Record<EventName, Schema>>(
      this.emitter, // Share the same emitter for event continuity
      this.emitter.getMaxListeners(), // Preserve current maxListeners setting
      this.mode,
      this.broker,
      this.cleanupHandlerRegistrar
    );

    // Copy all existing state to the new instance
    newBus.eventSchemas = {
      ...this.eventSchemas,
      [eventName]: schema,
    } as any;

    // Copy middleware state
    newBus.middlewares = [...this.middlewares];
    newBus.advancedMiddlewares = [...this.advancedMiddlewares];
    newBus.hasMiddleware = this.hasMiddleware;
    newBus.hasAdvancedMiddleware = this.hasAdvancedMiddleware;

    // Copy lifecycle hooks
    newBus.lifecycleHooks = { ...this.lifecycleHooks };

    // Share wildcard listeners reference (they operate on the same emitter)
    newBus.wildcardListeners = this.wildcardListeners;

    return newBus;
  }

  /**
   * Register middleware for event processing.
   * @param fn - The middleware function to register.
   * @returns The AukBus instance.
   */
  middleware(fn: MiddlewareFn): this {
    this.middlewares.push(fn);
    this.hasMiddleware = true;
    return this;
  }

  /**
   * Register advanced middleware with context and next capability.
   * @param fn - The advanced middleware function to register.
   * @returns The AukBus instance.
   */
  advancedMiddleware(fn: AdvancedMiddlewareFn): this {
    this.advancedMiddlewares.push(fn);
    this.hasAdvancedMiddleware = true;
    return this;
  }

  /**
   * Register lifecycle hooks for message processing events.
   * @param hooks - The lifecycle hooks to register.
   * @returns The AukBus instance.
   */
  hooks(hooks: LifecycleHooks): this {
    this.lifecycleHooks = { ...this.lifecycleHooks, ...hooks };
    return this;
  }

  /**
   * Fire a specific lifecycle hook with proper error handling.
   * @param hookName - The name of the hook to fire.
   * @param args - Arguments to pass to the hook.
   * @private
   */
  private async fireHook(
    hookName: keyof LifecycleHooks,
    args: any[]
  ): Promise<void> {
    const hook = this.lifecycleHooks[hookName];
    if (!hook) return;

    try {
      await (hook as any)(...args);
    } catch (error) {
      console.error(`[AukBus] Error in lifecycle hook '${hookName}':`, error);
    }
  }

  /**
   * Apply all registered middleware to an event.
   * @param event - The event to process.
   * @param metadata - Message metadata for advanced middleware.
   * @param delivery - Delivery mode for the event.
   * @returns The processed event.
   */
  private async applyMiddleware(
    event: AukEvent,
    metadata?: MessageMetadata,
    delivery?: Delivery
  ): Promise<AukEvent> {
    let processedEvent = event;

    // Apply simple middleware first
    for (const middleware of this.middlewares) {
      processedEvent = await middleware(processedEvent);
    }

    // Apply advanced middleware with context
    if (this.hasAdvancedMiddleware && metadata) {
      const middlewareStack = [...this.advancedMiddlewares];
      let currentIndex = 0;

      // Enhanced context with state management
      const middlewareState = new Map<string, any>();
      const context: MiddlewareContext = {
        metadata,
        hooks: this.lifecycleHooks,
        delivery,
        isDistributed: this.mode === "distributed",
        state: {},
        set: (key: string, value: any) => {
          middlewareState.set(key, value);
        },
        get: (key: string) => {
          return middlewareState.get(key);
        },
        addCleanupHandler: (name: string, fn: CleanupFn) => {
          if (this.cleanupHandlerRegistrar) {
            this.cleanupHandlerRegistrar(name, fn);
          } else {
            console.warn(
              "[AukBus] No cleanup handler registrar available for middleware cleanup"
            );
          }
        },
      };

      const next = async (): Promise<AukEvent> => {
        if (currentIndex >= middlewareStack.length) {
          return processedEvent;
        }

        const middleware = middlewareStack[currentIndex++];
        if (!middleware) {
          return processedEvent;
        }

        return await middleware(processedEvent, context, next);
      };

      processedEvent = await next();
    }

    return processedEvent;
  }

  /**
   * Emit an event with a specific shape (synchronous version).
   * @param eventObj - The event object to emit.
   * @returns True if the event had listeners, false otherwise.
   */
  private emitSyncInternal(eventObj: AukEvent): boolean {
    // Fast path: emit to exact listeners
    const hasExactListeners = this.emitter.emit(eventObj.event, eventObj.data);

    // Fast path: check if we have any wildcard listeners
    if (this.wildcardListeners.length === 0) {
      return hasExactListeners;
    }

    // Process wildcard listeners
    let hasWildcardListeners = false;
    const listenersToRemove: number[] = [];

    for (let i = 0; i < this.wildcardListeners.length; i++) {
      const wildcardListener = this.wildcardListeners[i];
      if (!wildcardListener) continue;
      const { regex, listener, once } = wildcardListener;

      // Use pre-compiled regex if available, otherwise compile on demand
      const pattern = regex || this.compilePattern(wildcardListener.pattern);
      if (!regex) {
        wildcardListener.regex = pattern; // Cache for future use
      }

      if (pattern.test(eventObj.event)) {
        hasWildcardListeners = true;
        listener(eventObj.data);

        // Mark once listeners for removal
        if (once) {
          listenersToRemove.push(i);
        }
      }
    }

    // Remove once listeners (in reverse order to maintain indices)
    for (let i = listenersToRemove.length - 1; i >= 0; i--) {
      const idx = listenersToRemove[i];
      if (typeof idx === "number") {
        this.wildcardListeners.splice(idx, 1);
      }
    }

    return hasExactListeners || hasWildcardListeners;
  }

  /**
   * Emit an event synchronously without middleware processing.
   * Use this for performance-critical scenarios when you don't need middleware.
   * @param eventObj - The event object to emit.
   * @returns True if the event had listeners, false otherwise.
   */
  emitSync<EventName extends keyof S>(eventObj: {
    event: EventName;
    data: EventPayloads<S>[EventName];
  }): boolean;
  emitSync(eventObj: AukEvent): boolean;
  emitSync(eventObj: AukEvent): boolean {
    if (this.mode === "distributed" && this.broker) {
      // In distributed mode, only publish to broker (broker handles all delivery)
      this.broker
        .publish(eventObj.event as string, eventObj.data)
        .catch((error) => {
          console.error(
            `[AukBus] Failed to publish event ${eventObj.event}:`,
            error
          );
        });
      // Return true since we published (though we can't know if there were listeners)
      return true;
    }

    // In local mode, emit locally only
    return this.emitSyncInternal(eventObj);
  }

  /**
   * Emit an event with a specific shape.
   * @param eventObj - The event object to emit.
   * @returns True if the event had listeners, false otherwise.
   */
  async emit<EventName extends keyof S>(eventObj: {
    event: EventName;
    data: EventPayloads<S>[EventName];
  }): Promise<boolean>;
  async emit(eventObj: AukEvent): Promise<boolean>;
  async emit(eventObj: AukEvent): Promise<boolean> {
    const metadata: MessageMetadata = {
      attemptCount: 1,
      timestamp: Date.now(),
      messageId: `${eventObj.event}-${Date.now()}-${Math.random()}`,
    };

    // Fire onReceived hook
    await this.fireHook("onReceived", [eventObj, metadata]);

    try {
      // Fast path: skip validation and async processing when no middleware
      if (!this.hasMiddleware && !this.hasAdvancedMiddleware) {
        if (this.mode === "distributed" && this.broker) {
          // In distributed mode, only publish to broker (broker handles all delivery)
          await this.broker.publish(eventObj.event as string, eventObj.data);
          await this.fireHook("onSuccess", [eventObj, metadata]);
          return true;
        }

        // In local mode, emit locally only
        const result = this.emitSyncInternal(eventObj);
        await this.fireHook("onSuccess", [eventObj, metadata]);
        return result;
      }

      // Validation only when middleware is present (they might depend on structure)
      if (
        !eventObj ||
        typeof eventObj.event !== "string" ||
        typeof eventObj.data !== "object"
      ) {
        throw new Error(
          "AukBus.emit: event must be { event: string, data: Record<string, any> }"
        );
      }

      const processedEvent = await this.applyMiddleware(eventObj, metadata);

      if (this.mode === "distributed" && this.broker) {
        // In distributed mode, only publish to broker (broker handles all delivery)
        await this.broker.publish(
          processedEvent.event as string,
          processedEvent.data
        );
        await this.fireHook("onSuccess", [processedEvent, metadata]);
        return true;
      }

      // In local mode, emit locally only
      const result = this.emitSyncInternal(processedEvent);
      await this.fireHook("onSuccess", [processedEvent, metadata]);
      return result;
    } catch (error) {
      await this.fireHook("onFailed", [eventObj, error as Error, metadata]);
      throw error;
    }
  }

  /**
   * Register an event listener. Supports wildcard patterns.
   * @param event - The event name or wildcard pattern (e.g., "user.*", "*.created", "*")
   * @param listener - The listener function.
   * @param opts - Optional delivery configuration for distributed mode.
   * @returns The AukBus instance.
   */
  on<EventName extends keyof S>(
    event: EventName,
    listener: (data: EventPayloads<S>[EventName]) => void,
    opts?: { delivery?: Delivery }
  ): this;
  on(
    event: string,
    listener: (data: any) => void,
    opts?: { delivery?: Delivery }
  ): this;
  on(
    event: string,
    listener: (data: any) => void,
    // biome-ignore lint/correctness/noUnusedFunctionParameters: opts is accepted for API compatibility and future use, but is currently unused because distributed delivery is handled by middleware, not here.
    opts: { delivery?: Delivery } = {}
  ): this {
    // Register event listeners locally - middleware will handle distributed aspects
    if (this.isWildcardPattern(event)) {
      // Pre-compile regex for better performance
      const regex = this.compilePattern(event);
      this.wildcardListeners.push({ pattern: event, listener, regex });
    } else {
      this.emitter.on(event, listener);
    }

    return this;
  }

  /**
   * Remove an event listener. Supports wildcard patterns.
   * @param event - The event name or wildcard pattern.
   * @param listener - The listener function.
   * @returns The AukBus instance.
   */
  off<EventName extends keyof S>(
    event: EventName,
    listener: (data: EventPayloads<S>[EventName]) => void
  ): this;
  off(event: string, listener: (data: any) => void): this;
  off(event: string, listener: (data: any) => void): this {
    if (this.isWildcardPattern(event)) {
      this.wildcardListeners = this.wildcardListeners.filter(
        (wl) => !(wl.pattern === event && wl.listener === listener)
      );
    } else {
      this.emitter.off(event, listener);
    }
    return this;
  }

  /**
   * Register a one-time event listener. Supports wildcard patterns.
   * @param event - The event name or wildcard pattern.
   * @param listener - The listener function.
   * @returns The AukBus instance.
   */
  once<EventName extends keyof S>(
    event: EventName,
    listener: (data: EventPayloads<S>[EventName]) => void
  ): this;
  once(event: string, listener: (data: any) => void): this;
  once(event: string, listener: (data: any) => void): this {
    if (this.isWildcardPattern(event)) {
      // Pre-compile regex for better performance
      const regex = this.compilePattern(event);
      this.wildcardListeners.push({
        pattern: event,
        listener,
        once: true,
        regex,
      });
    } else {
      this.emitter.once(event, listener);
    }
    return this;
  }

  /**
   * Create a copy of this bus with hooks exposed for plugins and modules.
   * This allows plugins and modules to register their own lifecycle hooks.
   * @returns A new AukBus instance with hooks exposed.
   */
  createCopyWithHooks(): AukBus<S> {
    // Create a new bus instance that shares the same underlying emitter and configuration
    const bus = new AukBus<S>(
      this.emitter,
      0, // maxListeners will be set by the parent
      this.mode,
      this.broker,
      this.cleanupHandlerRegistrar
    );

    // Copy over any existing event schemas
    bus.eventSchemas = { ...this.eventSchemas };

    // Copy over any existing middleware
    bus.middlewares = [...this.middlewares];
    bus.advancedMiddlewares = [...this.advancedMiddlewares];
    bus.hasMiddleware = this.hasMiddleware;
    bus.hasAdvancedMiddleware = this.hasAdvancedMiddleware;

    // Copy over any existing lifecycle hooks
    bus.lifecycleHooks = { ...this.lifecycleHooks };

    // Share wildcard listeners reference instead of copying
    // This ensures all bus instances share the same wildcard listeners
    bus.wildcardListeners = this.wildcardListeners;

    return bus;
  }

  /**
   * Merge listeners from another AukBus instance.
   * This is used for the .use() method to combine multiple bus instances.
   * @param other - The other AukBus instance to merge listeners from
   */
  mergeListenersFrom<T extends EventSchemas>(other: AukBus<T>): void {
    // Merge exact event listeners
    const otherEmitter = (other as any).emitter as NodeEventEmitter;
    if (otherEmitter) {
      const eventNames = otherEmitter.eventNames();
      for (const eventName of eventNames) {
        const listeners = otherEmitter.listeners(eventName);
        for (const listener of listeners) {
          this.emitter.on(eventName, listener as any);
        }
      }
    }

    // Merge wildcard listeners
    const otherWildcardListeners = (other as any).wildcardListeners;
    if (Array.isArray(otherWildcardListeners)) {
      this.wildcardListeners.push(...otherWildcardListeners);
    }

    // Merge middleware
    const otherMiddlewares = (other as any).middlewares;
    if (Array.isArray(otherMiddlewares)) {
      this.middlewares.push(...otherMiddlewares);
      this.hasMiddleware = this.hasMiddleware || otherMiddlewares.length > 0;
    }

    const otherAdvancedMiddlewares = (other as any).advancedMiddlewares;
    if (Array.isArray(otherAdvancedMiddlewares)) {
      this.advancedMiddlewares.push(...otherAdvancedMiddlewares);
      this.hasAdvancedMiddleware =
        this.hasAdvancedMiddleware || otherAdvancedMiddlewares.length > 0;
    }

    // Merge lifecycle hooks
    const otherLifecycleHooks = (other as any).lifecycleHooks;
    if (otherLifecycleHooks) {
      this.lifecycleHooks = { ...this.lifecycleHooks, ...otherLifecycleHooks };
    }

    // Merge event schemas
    const otherEventSchemas = (other as any).eventSchemas;
    if (otherEventSchemas) {
      this.eventSchemas = { ...this.eventSchemas, ...otherEventSchemas };
    }
  }

  /**
   * Remove all event listeners from the underlying emitter.
   * This is useful for cleanup during shutdown.
   */
  removeAllListeners(): void {
    this.emitter.removeAllListeners();
    this.wildcardListeners = []; // Also clear wildcard listeners
  }
}

/**
 * Get the global Auk configuration singleton.
 * @throws If the config is not initialised.
 * @returns The required AukConfig object.
 */
let _globalAukConfig: Required<AukConfig> | undefined;
export function getAukConfig(): Required<AukConfig> {
  if (!_globalAukConfig) throw new Error("Auk config not initialised");
  return _globalAukConfig;
}

/**
 * Get the name of a plugin.
 * @param plugin - The plugin object or function.
 * @returns The plugin name.
 */
function getPluginName<S extends EventSchemas>(plugin: AukPlugin<S>): string {
  if (typeof plugin === "function") return plugin.name || "anonymous-plugin";
  return plugin.name;
}
/**
 * Get the name of a module.
 * @param mod - The module object or function.
 * @returns The module name.
 */
function getModuleName<S extends EventSchemas>(mod: AukModule<S>): string {
  if (typeof mod === "function") return mod.name || "anonymous-module";
  return mod.name;
}
/**
 * Get the plugin function from a plugin object or function.
 * @param plugin - The plugin object or function.
 * @returns The plugin function.
 */
function getPluginFn<S extends EventSchemas>(
  plugin: AukPlugin<S>
): PluginFn<S> {
  return typeof plugin === "function" ? plugin : plugin.fn;
}
/**
 * Get the module function from a module object or function.
 * @param mod - The module object or function.
 * @returns The module function.
 */
function getModuleFn<S extends EventSchemas>(mod: AukModule<S>): ModuleFn<S> {
  return typeof mod === "function" ? mod : mod.fn;
}

/**
 * Prefixes all logger output with a given string.
 * @param baseLogger - The base logger object.
 * @param prefix - The prefix string.
 * @returns A logger object with prefixed output.
 */
function prefixLogger(
  baseLogger: AukContext["logger"],
  prefix: string
): AukContext["logger"] {
  const wrap =
    (method: keyof typeof baseLogger) =>
    (...args: Parameters<(typeof baseLogger)[typeof method]>) =>
      baseLogger[method](`[${prefix}]`, ...args);
  return {
    info: wrap("info"),
    warn: wrap("warn"),
    error: wrap("error"),
    debug: wrap("debug"),
  };
}

/**
 * Main Auk class for service setup, plugin/module registration, and startup.
 *
 * @example Fluent Typing Pattern (IMPORTANT!)
 * ```typescript
 * // ✅ CORRECT: Always chain .event() calls or assign the result
 * const app = new Auk({ config: { env: "development" } })
 *   .event("user.created", Type.Object({ id: Type.String() }))
 *   .event("user.updated", Type.Object({ id: Type.String() }));
 *
 * // ✅ CORRECT: Assign to a new variable
 * const baseApp = new Auk({ config: { env: "development" } });
 * const typedApp = baseApp.event("order.placed", Type.Object({ id: Type.String() }));
 *
 * // ❌ WRONG: Don't mutate without assignment - types are lost!
 * const wrongApp = new Auk({ config: { env: "development" } });
 * wrongApp.event("some.event", Type.Object({ data: Type.String() })); // Types lost!
 * ```
 */
export class Auk<S extends EventSchemas = {}> {
  /**
   * The Auk context object.
   */
  public context: AukContext;
  /**
   * The Auk event bus instance.
   */
  public eventBus: AukBus<S>;
  private _plugins: {
    name: string;
    fn: PluginFn<S>;
    delivery?: Delivery;
  }[] = [];
  private _modules: {
    name: string;
    fn: ModuleFn<S>;
    delivery?: Delivery;
  }[] = [];
  private _cleanupHandlers: { name: string; fn: CleanupFn }[] = [];
  private _isShuttingDown = false;
  private _shutdownResolver?: () => void;
  private _mode: AukMode;
  private _broker?: Broker;

  /**
   * Create a new Auk instance.
   * @param options - The Auk setup options.
   */
  constructor(options?: {
    config?: AukConfig;
    logger?: AukContext["logger"];
    mode?: AukMode;
    broker?: Broker;
    [key: string]: unknown;
  }) {
    const { config, logger, mode, broker, ...rest } = options ?? {};

    // Store mode and broker
    this._mode = mode ?? "local";
    this._broker = broker;

    // Provide a default config if none is supplied
    const defaultConfig: Required<AukConfig> = {
      env: "development",
      serviceName: "auk-service",
      maxEventListeners: 0,
    };
    const fullConfig: Required<AukConfig> = {
      ...defaultConfig,
      ...(config ?? {}),
      serviceName: config?.serviceName ?? defaultConfig.serviceName,
      maxEventListeners:
        config?.maxEventListeners ?? defaultConfig.maxEventListeners,
      env: config?.env ?? defaultConfig.env,
    };
    const defaultLogger: AukContext["logger"] = {
      info: (...args) => console.info(...args),
      warn: (...args) => console.warn(...args),
      error: (...args) => console.error(...args),
      debug: (...args) => console.debug(...args),
    };
    const serviceLogger = prefixLogger(
      logger ?? defaultLogger,
      fullConfig.serviceName
    );
    this.context = {
      config: fullConfig,
      logger: serviceLogger,
      health: { status: "healthy", checks: {} },
      addCleanupHandler: (name: string, fn: CleanupFn) =>
        this.addCleanupHandler(name, fn),
      setInterval: (callback: () => void, delay: number) => {
        const intervalId = setInterval(callback, delay);
        this.addCleanupHandler(`auto-interval-${intervalId}`, () => {
          clearInterval(intervalId);
        });
        return intervalId;
      },
      setTimeout: (callback: () => void, delay: number) => {
        const timeoutId = setTimeout(callback, delay);
        this.addCleanupHandler(`auto-timeout-${timeoutId}`, () => {
          clearTimeout(timeoutId);
        });
        return timeoutId;
      },
      ...rest,
    };
    _globalAukConfig = fullConfig;
    this.eventBus = new AukBus<S>(
      undefined,
      fullConfig.maxEventListeners,
      this._mode,
      this._broker,
      (name: string, fn: CleanupFn) => this.addCleanupHandler(name, fn)
    );

    // Global state removed - middleware now uses explicit context passing
  }

  /**
   * Register a middleware function for event processing.
   * @param fn - The middleware function to register.
   * @returns The Auk instance (for chaining).
   */
  middleware(fn: MiddlewareFn | AdvancedMiddlewareFn): this {
    // Auto-detect if it's advanced middleware based on function signature
    if (fn.length >= 3) {
      this.eventBus.advancedMiddleware(fn as AdvancedMiddlewareFn);
    } else {
      this.eventBus.middleware(fn as MiddlewareFn);
    }
    return this;
  }

  /**
   * Register lifecycle hooks for message processing events.
   * @param hooks - The lifecycle hooks to register.
   * @returns The Auk instance (for chaining).
   */
  hooks(hooks: LifecycleHooks): this {
    this.eventBus.hooks(hooks);
    return this;
  }

  /**
   * Register an onReceived lifecycle hook.
   * @param handler - The handler function.
   * @returns The Auk instance (for chaining).
   */
  onReceived(
    handler: (
      event: AukEvent,
      metadata: MessageMetadata
    ) => void | Promise<void>
  ): this {
    return this.hooks({ onReceived: handler });
  }

  /**
   * Register an onFailed lifecycle hook.
   * @param handler - The handler function.
   * @returns The Auk instance (for chaining).
   */
  onFailed(
    handler: (
      event: AukEvent,
      error: Error,
      metadata: MessageMetadata
    ) => void | Promise<void>
  ): this {
    return this.hooks({ onFailed: handler });
  }

  /**
   * Register an onRetry lifecycle hook.
   * @param handler - The handler function.
   * @returns The Auk instance (for chaining).
   */
  onRetry(
    handler: (
      event: AukEvent,
      attemptNumber: number,
      metadata: MessageMetadata
    ) => void | Promise<void>
  ): this {
    return this.hooks({ onRetry: handler });
  }

  /**
   * Register an onSuccess lifecycle hook.
   * @param handler - The handler function.
   * @returns The Auk instance (for chaining).
   */
  onSuccess(
    handler: (
      event: AukEvent,
      metadata: MessageMetadata
    ) => void | Promise<void>
  ): this {
    return this.hooks({ onSuccess: handler });
  }

  /**
   * Register an onDLQ lifecycle hook.
   * @param handler - The handler function.
   * @returns The Auk instance (for chaining).
   */
  onDLQ(
    handler: (
      event: AukEvent,
      metadata: DLQMessageMetadata
    ) => void | Promise<void>
  ): this {
    return this.hooks({ onDLQ: handler });
  }

  /**
   * Create a bus instance with hooks exposed for plugins and modules.
   * This allows plugins and modules to register their own lifecycle hooks.
   * @param name - The name of the plugin or module.
   * @returns A new AukBus instance with hooks exposed.
   */
  private createBusWithHooks(name: string): AukBus<S> {
    return this.eventBus.createCopyWithHooks();
  }

  /**
   * Register a cleanup handler for graceful shutdown.
   * @param name - Name of the cleanup handler.
   * @param fn - The cleanup function.
   * @returns The Auk instance (for chaining).
   */
  addCleanupHandler(name: string, fn: CleanupFn): this {
    this._cleanupHandlers.push({ name, fn });
    return this;
  }

  /**
   * Update a health check status.
   * @param checkName - Name of the health check.
   * @param isHealthy - Whether the check is healthy.
   */
  updateHealthCheck(checkName: string, isHealthy: boolean): void {
    this.context.health.checks[checkName] = isHealthy;

    // Update overall status based on all checks
    const allChecks = Object.values(this.context.health.checks);
    this.context.health.status =
      allChecks.length > 0 && allChecks.every((check) => check)
        ? "healthy"
        : "unhealthy";
  }

  /**
   * Get the current health status.
   * @returns The current health status object.
   */
  getHealthStatus(): HealthStatus {
    return { ...this.context.health };
  }

  /**
   * Trigger graceful shutdown programmatically.
   * Useful for tests or when you need to shut down without sending process signals.
   * @returns A promise that resolves when shutdown is complete.
   */
  async stop(): Promise<void> {
    if (this._isShuttingDown) {
      // If already shutting down, wait for the existing shutdown to complete
      return new Promise<void>((resolve) => {
        if (this._shutdownResolver) {
          const originalResolver = this._shutdownResolver;
          this._shutdownResolver = () => {
            originalResolver();
            resolve();
          };
        } else {
          resolve();
        }
      });
    }

    await this.shutdown();
    if (this._shutdownResolver) {
      this._shutdownResolver();
      this._shutdownResolver = undefined;
    }

    // For tests, we don't want to exit the process
    // Only exit if this is not a test environment
    if (process.env.NODE_ENV !== "test" && !process.env.BUN_TEST) {
      process.exit(0);
    }
  }

  /**
   * Perform graceful shutdown of the service.
   * @returns A promise that resolves when shutdown is complete.
   */
  async shutdown(): Promise<void> {
    if (this._isShuttingDown) {
      this.context.logger.warn("[Auk] Shutdown already in progress");
      return;
    }

    this._isShuttingDown = true;
    this.context.health.status = "unhealthy";
    this.context.logger.info("[Auk] Starting shutdown sequence...");

    // Run cleanup handlers in reverse order (LIFO)
    for (const { name, fn } of this._cleanupHandlers.reverse()) {
      try {
        this.context.logger.info(`[Auk] Running cleanup: ${name}`);
        await fn();
        this.context.logger.info(`[Auk] Cleanup completed: ${name}`);
      } catch (error) {
        this.context.logger.error(`[Auk] Cleanup failed for ${name}:`, error);
      }
    }

    // Close broker connection if in distributed mode
    if (this._mode === "distributed" && this._broker) {
      try {
        this.context.logger.info("[Auk] Closing broker connection...");
        await this._broker.close();
        this.context.logger.info("[Auk] Broker connection closed");
      } catch (error) {
        this.context.logger.error(
          "[Auk] Failed to close broker connection:",
          error
        );
      }
    }

    // Remove all event listeners from the event bus
    try {
      this.context.logger.info("[Auk] Removing event listeners...");
      this.eventBus.removeAllListeners();
      this.context.logger.info("[Auk] Event listeners removed");
    } catch (error) {
      this.context.logger.error(
        "[Auk] Failed to remove event listeners:",
        error
      );
    }

    this.context.logger.info("[Auk] Shutdown complete");
  }

  /**
   * Register one or more plugins (event producers).
   *
   * Plugins are designed to EMIT events into the system. They typically:
   * - Connect to external services
   * - Generate events based on timers or external triggers
   * - Transform external data into domain events
   *
   * Note: Plugins are loaded after modules to ensure listeners are ready.
   *
   * @param pluginFns - The plugins to register (can include plugins with events).
   * @returns The Auk instance (for chaining) or a new instance if plugins with events are included.
   *
   * @example
   * ```typescript
   * // A plugin that produces user events
   * auk.plugins({
   *   name: "user-producer",
   *   fn: async (bus, context) => {
   *     // Emit events periodically or based on external triggers
   *     context.setInterval(() => {
   *       bus.emit({ event: "user.heartbeat", data: { timestamp: Date.now() } });
   *     }, 30000);
   *   }
   * });
   * ```
   */
  plugins<E extends EventSchemas>(
    ...pluginFns: (AukPlugin<S> | PluginWithEvents<S, E>)[]
  ): Auk<MergeEventSchemas<S, E>> | this {
    // Separate regular plugins from plugins with events
    const regularPlugins: AukPlugin<S>[] = [];
    const pluginsWithEvents: PluginWithEvents<S, E>[] = [];

    for (const plugin of pluginFns) {
      if ("events" in plugin && typeof plugin === "object" && plugin.events) {
        pluginsWithEvents.push(plugin as PluginWithEvents<S, E>);
      } else {
        regularPlugins.push(plugin as AukPlugin<S>);
      }
    }

    // Validate that we have at most one plugin with events
    if (pluginsWithEvents.length > 1) {
      throw new Error(
        "Cannot register multiple plugins with events in a single .plugins() call. " +
          "Register them separately or use .events() to define schemas first."
      );
    }

    // Register all regular plugins
    for (const plugin of regularPlugins) {
      const name = getPluginName(plugin);
      if (!name) throw new Error("All plugins must have a name");
      const delivery =
        typeof plugin === "function" ? undefined : (plugin as any).delivery;
      // Explicitly type the function to preserve generic type information
      const pluginFn: PluginFn<S> = getPluginFn(plugin);
      this._plugins.push({
        name,
        fn: pluginFn,
        delivery,
      });
    }

    // Handle plugin with events if present
    if (pluginsWithEvents.length === 1) {
      const pluginWithEvents = pluginsWithEvents[0]!; // Safe because we checked length === 1

      // Create a new Auk instance with merged event schemas
      const newAuk = new Auk<MergeEventSchemas<S, E>>({
        config: this.context.config,
        logger: this.context.logger,
        mode: this._mode,
        broker: this._broker,
        // Copy any additional context properties
        ...Object.fromEntries(
          Object.entries(this.context).filter(
            ([key]) =>
              ![
                "config",
                "logger",
                "health",
                "addCleanupHandler",
                "setInterval",
                "setTimeout",
              ].includes(key)
          )
        ),
      });

      // Create a new event bus with merged schemas by adding each event from the plugin
      let newBus = this.eventBus as any;
      for (const [eventName, schema] of Object.entries(
        pluginWithEvents.events
      )) {
        newBus = newBus.event(eventName, schema);
      }
      newAuk.eventBus = newBus;

      // Copy all existing state to the new instance (including regular plugins we just added)
      newAuk._plugins = [...this._plugins] as Array<{
        name: string;
        fn: PluginFn<MergeEventSchemas<S, E>>;
        delivery?: Delivery;
      }>;
      newAuk._modules = [...this._modules] as Array<{
        name: string;
        fn: ModuleFn<MergeEventSchemas<S, E>>;
        delivery?: Delivery;
      }>;
      newAuk._cleanupHandlers = [...this._cleanupHandlers];
      newAuk._isShuttingDown = this._isShuttingDown;

      // Copy health status
      newAuk.context.health = { ...this.context.health };

      // Register the plugin with events itself
      newAuk._plugins.push({
        name: pluginWithEvents.name,
        fn: pluginWithEvents.fn,
        delivery: pluginWithEvents.delivery,
      });

      return newAuk as Auk<MergeEventSchemas<S, E>>;
    }

    // No plugins with events, return current instance
    return this;
  }

  /**
   * Register one or more modules (event consumers).
   *
   * Modules are designed to LISTEN to events in the system. They typically:
   * - Set up event handlers for business logic
   * - Process domain events and update state
   * - Trigger side effects based on events
   *
   * Note: Modules are loaded before plugins to ensure listeners are ready when events are emitted.
   *
   * @param moduleFns - The modules to register.
   * @returns The Auk instance (for chaining).
   *
   * @example
   * ```typescript
   * // A module that handles user events
   * auk.modules({
   *   name: "user-handler",
   *   fn: (bus, context) => {
   *     // Listen to events and handle them
   *     bus.on("user.created", (data) => {
   *       context.logger.info("New user created:", data.id);
   *       // Process the user creation event
   *     });
   *   }
   * });
   * ```
   */
  modules(...moduleFns: AukModule<S>[]) {
    for (const mod of moduleFns) {
      const name = getModuleName(mod);
      if (!name) throw new Error("All modules must have a name");
      const delivery = typeof mod === "function" ? undefined : mod.delivery;
      this._modules.push({ name, fn: getModuleFn(mod), delivery });
    }
    return this;
  }

  /**
   * Create context with logger and cleanup handlers for modules/plugins.
   * @param name - The name of the module or plugin
   * @returns Enhanced context with prefixed logger and cleanup handlers
   */
  private createContextWithLogger(name: string): AukContext {
    return {
      ...this.context,
      logger: prefixLogger(this.context.logger, name),
      addCleanupHandler: (cleanupName: string, cleanupFn: CleanupFn) =>
        this.addCleanupHandler(`${name}-${cleanupName}`, cleanupFn),
      setInterval: (callback: () => void, delay: number) => {
        const intervalId = setInterval(callback, delay);
        this.addCleanupHandler(`${name}-auto-interval-${intervalId}`, () => {
          clearInterval(intervalId);
        });
        return intervalId;
      },
      setTimeout: (callback: () => void, delay: number) => {
        const timeoutId = setTimeout(callback, delay);
        this.addCleanupHandler(`${name}-auto-timeout-${timeoutId}`, () => {
          clearTimeout(timeoutId);
        });
        return timeoutId;
      },
    };
  }

  /**
   * Load modules and plugins (shared logic between start() and startNonBlocking()).
   * @returns A promise that resolves when all modules and plugins are loaded
   */
  private async loadModulesAndPlugins(): Promise<void> {
    // Register modules (listeners) first
    for (const { name, fn } of this._modules) {
      const contextWithLogger = this.createContextWithLogger(name);

      // Create a bus with hooks exposed for the module
      const moduleBus = this.createBusWithHooks(name);
      fn(moduleBus, contextWithLogger);
      this.context.logger.info(`[Auk] Module loaded: ${name}`);
    }

    // Then run plugins (emitters)
    for (const { name, fn } of this._plugins) {
      const contextWithLogger = this.createContextWithLogger(name);

      // Create a bus with hooks exposed for the plugin
      const pluginBus = this.createBusWithHooks(name);
      try {
        // Explicitly type the function call to preserve type information
        await (fn as PluginFn<S>)(pluginBus, contextWithLogger);
        this.context.logger.info(`[Auk] Plugin loaded: ${name}`);
      } catch (error) {
        this.context.logger.error(
          `[Auk] Failed to load plugin '${name}':`,
          error
        );
        // Continue loading other plugins
      }
    }
  }

  /**
   * Start the Auk service, loading modules and plugins.
   * This method will block and keep the process alive until a shutdown signal is received.
   * For tests, use startNonBlocking() instead.
   * @returns A promise that resolves when shutdown is complete.
   */
  async start() {
    await this.loadModulesAndPlugins();

    this.context.logger.info(
      `[Auk] Service '${this.context.config.serviceName}' started!`
    );

    // Keep the process alive until shutdown is triggered
    return new Promise<void>((resolve) => {
      // Store the resolver for programmatic shutdown
      this._shutdownResolver = resolve;

      // Remove any existing handlers to avoid conflicts
      process.removeAllListeners("SIGINT");
      process.removeAllListeners("SIGTERM");

      const shutdownHandler = async (signal: string) => {
        if (this._isShuttingDown) return;
        this.context.logger.info(
          `[Auk] Received ${signal}, starting graceful shutdown...`
        );
        await this.shutdown();
        resolve();

        // Force exit after shutdown is complete
        process.exit(0);
      };

      process.on("SIGINT", () => shutdownHandler("SIGINT"));
      process.on("SIGTERM", () => shutdownHandler("SIGTERM"));

      // Keep the process alive with a timeout that never resolves
      const keepAliveTimeout = setTimeout(() => {
        // This timeout will never execute, but keeps the event loop alive
      }, 2147483647); // Max timeout value (about 24.8 days)

      // Store cleanup to clear the timeout during shutdown
      this.addCleanupHandler("keep-alive-timeout", () => {
        clearTimeout(keepAliveTimeout);
      });

      // Also clean up event listeners on shutdown
      this.addCleanupHandler("remove-event-listeners", () => {
        process.removeAllListeners("SIGINT");
        process.removeAllListeners("SIGTERM");
      });
    });
  }

  /**
   * Start the Auk service without blocking (for tests).
   * This loads modules and plugins but doesn't set up signal handlers or keep the process alive.
   * @returns A promise that resolves when startup is complete.
   */
  async startNonBlocking(): Promise<void> {
    await this.loadModulesAndPlugins();

    this.context.logger.info(
      `[Auk] Service '${this.context.config.serviceName}' started in non-blocking mode!`
    );
  }
}

/**
 * Extract event schemas from an Auk instance type.
 * This allows for referencing event schemas in plugin definitions.
 */
export type EventSchemasOf<T> = T extends Auk<infer S> ? S : never;

/**
 * Named plugin object with proper typing for event schemas.
 */
export interface Plugin<S extends EventSchemas = {}> {
  /**
   * Name of the plugin.
   */
  name: string;
  /**
   * Plugin function with properly typed context and bus.
   */
  fn: PluginFn<S>;
  /**
   * Delivery mode for distributed events (only applies in distributed mode).
   */
  delivery?: Delivery;
}

/**
 * Named module object with proper typing for event schemas.
 */
export interface Module<S extends EventSchemas = {}> {
  /**
   * Name of the module.
   */
  name: string;
  /**
   * Module function with properly typed bus and context.
   */
  fn: ModuleFn<S>;
  /**
   * Delivery mode for distributed events (only applies in distributed mode).
   */
  delivery?: Delivery;
}

export * from "./events.js";
export type { AukEvents, EventPayload } from "./events.js";
