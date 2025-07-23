/** biome-ignore-all lint/suspicious/noExplicitAny: <any is needed for type inference> */
import type { Static, TSchema } from "@sinclair/typebox";
import type { Broker } from "./broker.js";
import type { AukConfig, AukContext, HealthStatus } from "./config.js";
import {
  prefixLogger as _prefixLogger,
  setAukConfig as _setAukConfig,
} from "./config.js";
import { AukBus } from "./event-bus.js";
import type { AukMiddleware, LifecycleHooks, MessageMetadata } from "./lifecycle.js";
import type { AdvancedMiddlewareFn, MiddlewareFn } from "./middleware.js";
import { ProducerBuilder } from "./producer-builder.js";
import type {
  ConsumerFn,
  ProducerFn,
} from "./producers.js";
import type { AukMode, CleanupFn, Delivery } from "./types.js";

/**
 * Plugin function signature for extending Auk instances.
 */
export type PluginFn<Context extends AukContext = AukContext> = (
  auk: Auk<any, Context, any>,
  context: Context,
  bus: AukBus<any>
) => Promise<void> | void;

/**
 * Plugin object with metadata.
 */
export interface Plugin<Context extends AukContext = AukContext> {
  name: string;
  fn: PluginFn<Context>;
}

/**
 * Module function signature for extending Auk instances.
 */
export type ModuleFn<Context extends AukContext = AukContext> = (
  bus: AukBus<any>,
  context?: Context
) => Promise<void> | void;

/**
 * Module object with metadata.
 */
export interface Module<Context extends AukContext = AukContext> {
  name: string;
  fn: ModuleFn<Context>;
}

/**
 * Main Auk class for service setup, producer/consumer registration, and startup.
 *
 * @example Type-safe Event Schema Pattern
 * ```typescript
 * // Define your event schemas
 * const Events = {
 *   "user.created": Type.Object({ id: Type.String(), email: Type.String() }),
 *   "order.placed": Type.Object({ orderId: Type.Number(), userId: Type.String() })
 * } as const;
 *
 * // Create Auk instance with events
 * const auk = new Auk(Events, { config: { env: "development" } });
 *
 * // Register consumers with full type safety
 * auk.consumer("user.created", (user, ctx) => {
 *   // user is typed as { id: string, email: string }
 *   ctx.logger.info("User created:", user.id);
 * });
 * ```
 */
export class Auk<
  EventSchemas extends Record<string, TSchema> = {},
  Context extends AukContext = AukContext,
  Producers extends Record<string, any> = {}
> {
  public webhook?: { server: any; routes: Map<string, any> };
  /**
   * The Auk context object.
   */
  public context: Context;
  /**
   * The Auk event bus instance.
   */
  public eventBus: AukBus<EventSchemas>;
  /**
   * The event schemas for this Auk instance.
   */
  public events: EventSchemas;

  private _consumers: {
    name: string;
    eventName: string;
    fn: ConsumerFn<any, Context>;
    delivery?: Delivery;
  }[] = [];
  private _registeredProducers: Map<
    string,
    ProducerFn<keyof EventSchemas, EventSchemas, Context>
  > = new Map();
  private _cleanupHandlers: { name: string; fn: CleanupFn }[] = [];
  private _isShuttingDown = false;
  private _shutdownResolver?: () => void;
  private _mode: AukMode;
  private _broker?: Broker;
  private _middlewares: AukMiddleware<EventSchemas>[] = [];

  /**
   * Create a new Auk instance.
   * @param events - The event schemas object
   * @param options - The Auk setup options.
   */
  constructor(
    events: EventSchemas,
    options?: {
      config?: AukConfig;
      logger?: AukContext["logger"];
      mode?: AukMode;
      broker?: Broker;
      [key: string]: unknown;
    }
  ) {
    const { config, logger, mode, broker, ...rest } = options ?? {};

    // Store events from the constructor
    this.events = events;
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
      info: (...args: unknown[]) => console.info(...args),
      warn: (...args: unknown[]) => console.warn(...args),
      error: (...args: unknown[]) => console.error(...args),
      debug: (...args: unknown[]) => console.debug(...args),
    };
    const serviceLogger = _prefixLogger(
      logger ?? defaultLogger,
      fullConfig.serviceName
    );
    const baseContext: AukContext = {
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
    this.context = baseContext as Context;
    this.webhook = undefined;
    _setAukConfig(fullConfig);
    this.eventBus = new AukBus<EventSchemas>(
      undefined,
      fullConfig.maxEventListeners,
      this._mode,
      this._broker,
      (name: string, fn: CleanupFn) => this.addCleanupHandler(name, fn)
    );

    // Global state removed - middleware now uses explicit context passing
    
    // Run onAukInit hook after initialization
    this.runHook('onAukInit', { auk: this }).catch(error => {
      this.context.logger.error('[Auk] onAukInit hook failed:', error);
    });
  }

  /**
   * Define an event schema for type safety.
   * @param eventName - The event name
   * @param schema - The TypeBox schema for the event data
   * @returns A new Auk instance with the event schema registered
   */

  event<EventName extends string, Schema extends TSchema>(
    eventName: EventName,
    schema: Schema
  ): Auk<EventSchemas & Record<EventName, Schema>, Context, Producers> {
    // Create a new instance with the added event schema
    const newInstance = new Auk<
      EventSchemas & Record<EventName, Schema>,
      Context,
      Producers
    >(this.events as any, {
      ...this.context,
      mode: this._mode,
      broker: this._broker,
    });

    // Copy over existing event schemas and add the new one
    newInstance.events = {
      ...this.events,
      [eventName]: schema,
    } as any;

    // Copy over existing state
    newInstance._consumers = [...this._consumers];
    newInstance._registeredProducers = new Map(
      this._registeredProducers
    ) as any;
    newInstance._cleanupHandlers = [...this._cleanupHandlers];

    // Update the event bus with the new schema
    newInstance.eventBus = this.eventBus.event(eventName, schema) as any;

    return newInstance;
  }

  /**
   * Register plugins for extending functionality.
   * @deprecated Use producers and consumers instead: auk.producer().from().handle() and auk.consumer()
   * @param plugins - Plugin or array of plugins to register
   * @returns The Auk instance (for chaining)
   */
  plugins(...plugins: (Plugin<Context> | PluginFn<Context>)[]): this {
    console.warn(
      "[Auk] plugins() is deprecated. Use producers and consumers instead: auk.producer().from().handle() and auk.consumer()"
    );
    for (const plugin of plugins.flat()) {
      if (typeof plugin === "function") {
        // Handle function plugins
        plugin(this, this.context, this.eventBus);
      } else {
        // Handle plugin objects
        this.addCleanupHandler(`plugin-${plugin.name}`, () => {
          this.context.logger.debug(`[Auk] Cleaning up plugin: ${plugin.name}`);
        });
        plugin.fn(this, this.context, this.eventBus);
      }
    }
    return this;
  }

  /**
   * Compose this Auk instance with another, merging their event schemas and functionality.
   * @param other - Another Auk instance to compose with
   * @returns A new Auk instance with merged functionality
   */
  compose<OtherEventSchemas extends EventSchemas>(
    other: Auk<OtherEventSchemas, any, any>
  ): Auk<EventSchemas & OtherEventSchemas, Context, Producers> {
    // Create new instance with merged event schemas
    const composed = new Auk<
      EventSchemas & OtherEventSchemas,
      Context,
      Producers
    >(this.events as any, {
      ...this.context,
      mode: this._mode,
      broker: this._broker,
    });

    // Merge event schemas
    composed.events = { ...this.events, ...other.events } as any;

    // Create new event bus with merged schemas and listeners
    composed.eventBus = new AukBus<EventSchemas & OtherEventSchemas>(
      undefined,
      this.context.config.maxEventListeners,
      this._mode,
      this._broker,
      (name: string, fn: CleanupFn) => composed.addCleanupHandler(name, fn)
    );

    // Merge listeners from both instances
    composed.eventBus.mergeListenersFrom(this.eventBus);
    composed.eventBus.mergeListenersFrom(other.eventBus);

    // Merge other state
    composed._consumers = [...this._consumers, ...(other as any)._consumers];
    composed._registeredProducers = new Map([
      ...this._registeredProducers,
      ...(other as any)._registeredProducers,
    ]) as any;
    composed._cleanupHandlers = [
      ...this._cleanupHandlers,
      ...(other as any)._cleanupHandlers,
    ];

    return composed;
  }

  /**
   * Register a consumer for a specific event.
   * @param eventName - The event name to listen for
   * @param handler - The consumer function
   * @param opts - Optional delivery configuration
   * @returns The Auk instance (for chaining)
   */
  consumer<EventName extends keyof EventSchemas>(
    eventName: EventName,
    handler: ConsumerFn<EventSchemas[EventName], Context>,
    opts?: { delivery?: Delivery; name?: string }
  ): this {
    const name = opts?.name ?? `consumer-${String(eventName)}-${Date.now()}`;

    // Wrap handler with lifecycle hooks
    const wrappedHandler: ConsumerFn<EventSchemas[EventName], Context> = async (payload, ctx) => {
      try {
        // Fire onEventConsumed hook before processing
        await this.runHook('onEventConsumed', {
          eventName,
          payload,
          consumer: handler as any,
          ctx,
        });
        
        // Execute the actual handler
        await handler(payload, ctx);
      } catch (error) {
        // Fire onConsumeError hook on failure
         await this.runHook('onConsumeError', {
           eventName,
           payload,
           consumer: handler as any,
           error: error as Error,
           ctx,
         });
        throw error;
      }
    };

    this._consumers.push({
      name,
      eventName: String(eventName),
      fn: wrappedHandler,
      delivery: opts?.delivery,
    });

    // Run onConsumerRegistered hook
    this.runHook('onConsumerRegistered', {
      eventName,
      consumer: handler as any,
      delivery: opts?.delivery,
    }).catch(error => {
      this.context.logger.error('[Auk] onConsumerRegistered hook failed:', error);
    });

    return this;
  }

  /**
   * Create a new producer builder for the specified event.
   * This is the new fluent API: .producer(eventName).from(trigger).handle(handler)
   * @param eventName - The event name to produce
   * @returns ProducerBuilder for fluent configuration
   */
  producer<Evt extends keyof EventSchemas>(
    eventName: Evt
  ): ProducerBuilder<EventSchemas, Evt, void, Context> {
    const builder = new ProducerBuilder<EventSchemas, Evt, void, Context>(
      {
        ctx: () => this.context,
        emit: <E extends keyof EventSchemas>(
          event: E,
          payload: Static<EventSchemas[E]>
        ) => {
          this.eventBus.emit({ event: String(event), data: payload });
        },
        runHook: this.runHook.bind(this) as any,
      },
      eventName
    );

    // Run onProducerRegistered hook
    this.runHook('onProducerRegistered', {
      auk: this,
      eventName,
      builder,
    }).catch(error => {
      this.context.logger.error('[Auk] onProducerRegistered hook failed:', error);
    });

    return builder;
  }

  /**
   * Register a module of producers/consumers using a registrar function.
   * @param fn - Registrar function that accepts this Auk instance
   * @returns The Auk instance (for chaining)
   */
  use(fn: (auk: this) => any): this {
    fn(this);
    return this;
  }

  /**
   * Register a producer that can be called via asMethods().
   * @deprecated Use the new fluent API: auk.producer(eventName).from(trigger).handle(handler)
   * @param producerName - The name of the producer
   * @param producerFn - The producer function
   * @returns The Auk instance (for chaining)
   */
  registerProducer<ProducerName extends string>(
    producerName: ProducerName,
    producerFn: ProducerFn<keyof EventSchemas, EventSchemas, Context>
  ): Auk<
    EventSchemas,
    Context,
    Producers & Record<ProducerName, typeof producerFn>
  > {
    console.warn(
      `[Auk] registerProducer() is deprecated. Use the new fluent API: auk.producer("${producerName}").from(trigger).handle(handler)`
    );
    this._registeredProducers.set(producerName, producerFn);
    return this as any;
  }

  /**
   * Get an object with methods for each registered producer.
   * @deprecated Use the new fluent API: auk.producer(eventName).from(trigger).handle(handler)
   * @returns Object with producer methods
   */
  asMethods(): Producers {
    console.warn(
      "[Auk] asMethods() is deprecated. Use the new fluent API: auk.producer(eventName).from(trigger).handle(handler)"
    );
    return {} as Producers;
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
   * Register comprehensive lifecycle middleware for monitoring and control.
   * @param mw - The middleware object with lifecycle hooks
   * @returns The Auk instance (for chaining)
   */
  useMiddleware(mw: AukMiddleware<EventSchemas>): this {
    this._middlewares.push(mw);
    return this;
  }

  /**
   * Execute a specific middleware hook across all registered middlewares.
   * @param hook - The hook name to execute
   * @param opts - The options to pass to the hook
   * @private
   */
  private async runHook<K extends keyof AukMiddleware<EventSchemas>>(
    hook: K,
    opts: Parameters<NonNullable<AukMiddleware<EventSchemas>[K]>>[0]
  ): Promise<void> {
    for (const mw of this._middlewares) {
      const fn = mw[hook] as any;
      if (fn) {
        try {
          await fn(opts);
        } catch (error) {
          this.context.logger.error(`[Auk] Middleware hook ${String(hook)} failed:`, error);
        }
      }
    }
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
      event: import("./types.js").AukEvent,
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
      event: import("./types.js").AukEvent,
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
      event: import("./types.js").AukEvent,
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
      event: import("./types.js").AukEvent,
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
      event: import("./types.js").AukEvent,
      metadata: import("./broker.js").DLQMessageMetadata
    ) => void | Promise<void>
  ): this {
    return this.hooks({ onDLQ: handler });
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
    
    // Run onAukStop hook
    await this.runHook('onAukStop', { auk: this });

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
   * Create context with logger and cleanup handlers for modules/plugins.
   * @param name - The name of the module or plugin
   * @returns Enhanced context with prefixed logger and cleanup handlers
   */
  private createContextWithLogger(name: string): AukContext {
    return {
      ...this.context,
      logger: _prefixLogger(this.context.logger, name),
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
   * Load consumers and producers (shared logic between start() and startNonBlocking()).
   * @returns A promise that resolves when all consumers and producers are loaded
   */
  private async loadConsumersAndProducers(): Promise<void> {
    if (this._mode === "distributed" && this._broker) {
      this.context.logger.info(
        `[Auk] Subscribing ${this._consumers.length} consumers to broker...`
      );
      for (const consumer of this._consumers) {
        this.context.logger.info(
          `[Auk] Subscribing to event: ${consumer.eventName}`
        );
        await this._broker.subscribe(
          consumer.eventName,
          (data) => {
            const contextWithLogger = this.createContextWithLogger(
              consumer.name
            );
            consumer.fn(data, contextWithLogger as Context);
          },
          { delivery: consumer.delivery }
        );
      }
    }

    // Consumers are already registered via .consumer() method
    this.context.logger.info(
      `[Auk] Loaded ${this._consumers.length} consumers`
    );

    // Log registered producers (if there is any)
    if (this._registeredProducers.size > 0) {
      this.context.logger.info(
        `[Auk] Loaded ${this._registeredProducers.size} producers`
      );
    }
    
  }

  /**
   * Start the Auk service, loading consumers and producers.
   * This method will block and keep the process alive until a shutdown signal is received.
   * For tests, use startNonBlocking() instead.
   * @returns A promise that resolves when shutdown is complete.
   */
  async start() {
    // Run onAukStart hook
    await this.runHook('onAukStart', { auk: this });
    
    await this.loadConsumersAndProducers();

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
   * This loads consumers and producers but doesn't set up signal handlers or keep the process alive.
   * @returns A promise that resolves when startup is complete.
   */
  async startNonBlocking(): Promise<void> {
    await this.loadConsumersAndProducers();

    this.context.logger.info(
      `[Auk] Service '${this.context.config.serviceName}' started in non-blocking mode!`
    );
  }
}

/**
 * Extract event schemas from an Auk instance type.
 * This allows for referencing event schemas in producer definitions.
 */
export type EventSchemasOf<T> = T extends Auk<infer S, any, any> ? S : never;
