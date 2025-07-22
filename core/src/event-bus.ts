/** biome-ignore-all lint/suspicious/noExplicitAny: <any is needed for type inference> */
import { EventEmitter as NodeEventEmitter } from "node:events";
import type {
  AukEvent,
  EventSchemas,
  EventPayloads,
  EventData,
  AukMode,
  Delivery,
  CleanupFn,
} from "./types.js";
import type { Broker } from "./broker.js";
import type { MessageMetadata, LifecycleHooks } from "./lifecycle.js";
import type {
  MiddlewareFn,
  AdvancedMiddlewareFn,
  MiddlewareContext,
} from "./middleware.js";

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
  event<
    EventName extends string,
    Schema extends import("@sinclair/typebox").TSchema
  >(
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
