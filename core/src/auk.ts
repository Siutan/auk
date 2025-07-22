/** biome-ignore-all lint/suspicious/noExplicitAny: <any is needed for type inference> */
import type { TSchema, Static } from "@sinclair/typebox";
import type { AukMode, CleanupFn, Delivery } from "./types.js";
import type { Broker } from "./broker.js";
import type { MessageMetadata, LifecycleHooks } from "./lifecycle.js";
import type { MiddlewareFn, AdvancedMiddlewareFn } from "./middleware.js";
import type { AukConfig, AukContext, HealthStatus } from "./config.js";
import type {
  TypedEmitFn,
  RequiredProducerHandler,
  ProducerFn,
  ConsumerFn,
} from "./producers.js";
import { AukBus } from "./event-bus.js";
import {
  setAukConfig as _setAukConfig,
  prefixLogger as _prefixLogger,
} from "./config.js";

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
    fn: ConsumerFn<TSchema, Context>;
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
   * @param plugins - Plugin or array of plugins to register
   * @returns The Auk instance (for chaining)
   */
  plugins(...plugins: (Plugin<Context> | PluginFn<Context>)[]): this {
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
   * Register modules for extending functionality.
   * @param modules - Module or array of modules to register
   * @returns The Auk instance (for chaining)
   */
  modules(...modules: (Module<Context> | ModuleFn<Context>)[]): this {
    for (const module of modules.flat()) {
      if (typeof module === "function") {
        // Handle function modules
        module(this.eventBus, this.context);
      } else {
        // Handle module objects
        this.addCleanupHandler(`module-${module.name}`, () => {
          this.context.logger.debug(`[Auk] Cleaning up module: ${module.name}`);
        });
        module.fn(this.eventBus, this.context);
      }
    }
    return this;
  }

  /**
   * Compose this Auk instance with another, merging their event schemas and functionality.
   * @param other - Another Auk instance to compose with
   * @returns A new Auk instance with merged functionality
   */
  use<OtherEventSchemas extends EventSchemas>(
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

    this._consumers.push({
      name,
      eventName: String(eventName),
      fn: handler as ConsumerFn<TSchema, Context>,
      delivery: opts?.delivery,
    });

    // Register the consumer with the event bus
    this.eventBus.on(String(eventName), (data: any) => {
      const contextWithLogger = this.createContextWithLogger(name);
      handler(data, contextWithLogger as Context);
    });

    return this;
  }

  /**
   * Register a producer that can be called via asMethods().
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
    this._registeredProducers.set(producerName, producerFn);
    return this as any;
  }

  /**
   * Get an object with methods for each registered producer.
   * @returns Object with producer methods
   */
  asMethods(): Producers {
    const methods: any = {};

    for (const [
      producerName,
      producerFn,
    ] of this._registeredProducers.entries()) {
      methods[producerName] = <EventName extends keyof EventSchemas>(
        eventName: EventName,
        opts: {
          handler: RequiredProducerHandler<
            EventSchemas[EventName],
            Context,
            EventSchemas
          >;
        }
      ) => {
        // Create a fully typed emit function that knows about all event schemas
        const typedEmitFn: TypedEmitFn<EventSchemas> = <
          E extends keyof EventSchemas
        >(
          event: E,
          payload: Static<EventSchemas[E]>
        ) => {
          this.eventBus.emit({ event: String(event), data: payload });
        };

        return producerFn(eventName, {
          handler: (args) =>
            (
              opts.handler as RequiredProducerHandler<
                EventSchemas[EventName],
                Context,
                EventSchemas
              >
            )({
              payload: args.payload,
              ctx: this.context, // Always provide Auk's context
              emit: typedEmitFn, // Always provide the emit function
            }),
        });
      };
    }

    return methods as Producers;
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
    // Consumers are already registered via .consumer() method
    this.context.logger.info(
      `[Auk] Loaded ${this._consumers.length} consumers`
    );

    // Log registered producers
    this.context.logger.info(
      `[Auk] Loaded ${this._registeredProducers.size} producers`
    );
  }

  /**
   * Start the Auk service, loading consumers and producers.
   * This method will block and keep the process alive until a shutdown signal is received.
   * For tests, use startNonBlocking() instead.
   * @returns A promise that resolves when shutdown is complete.
   */
  async start() {
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
