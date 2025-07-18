import { EventEmitter as NodeEventEmitter } from "node:events";

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
  env: Record<string, string> | string;
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
   * Database connection or client.
   */
  db: unknown;
  /**
   * Health status object for service monitoring.
   */
  health: HealthStatus;
  /**
   * Any other context fields.
   */
  [key: string]: unknown;
}

/**
 * Plugin function signature.
 * @param context - The Auk context object.
 * @param bus - The Auk event bus.
 * @returns A promise or void.
 */
export type PluginFn = (
  context: AukContext,
  bus: AukBus
) => Promise<void> | void;

/**
 * Module function signature.
 * @param bus - The Auk event bus.
 * @param context - The Auk context object.
 */
export type ModuleFn = (bus: AukBus, context: AukContext) => void;

/**
 * Named plugin object.
 */
export interface NamedPlugin {
  /**
   * Name of the plugin.
   */
  name: string;
  /**
   * Plugin function.
   */
  fn: PluginFn;
}
/**
 * Named module object.
 */
export interface NamedModule {
  /**
   * Name of the module.
   */
  name: string;
  /**
   * Module function.
   */
  fn: ModuleFn;
}

/**
 * Type for plugin registration (named or function with optional name).
 */
export type AukPlugin = NamedPlugin | (PluginFn & { name?: string });
/**
 * Type for module registration (named or function with optional name).
 */
export type AukModule = NamedModule | (ModuleFn & { name?: string });

/**
 * AukBus wraps EventEmitter to enforce event shape and provide type safety.
 */
export class AukBus {
  private emitter: NodeEventEmitter;
  private middlewares: MiddlewareFn[] = [];
  private wildcardListeners: {
    pattern: string;
    listener: (data: EventData) => void;
    once?: boolean;
    regex?: RegExp;
  }[] = [];
  private hasMiddleware = false;

  /**
   * Create a new AukBus instance.
   * @param emitter - Optional NodeEventEmitter instance.
   * @param maxListeners - Maximum number of event listeners (0 = unlimited)
   */
  constructor(emitter?: NodeEventEmitter, maxListeners = 0) {
    this.emitter = emitter || new NodeEventEmitter();
    this.emitter.setMaxListeners(maxListeners); // Allow unlimited listeners by default, or use config
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
   * Apply all registered middleware to an event.
   * @param event - The event to process.
   * @returns The processed event.
   */
  private async applyMiddleware(event: AukEvent): Promise<AukEvent> {
    let processedEvent = event;
    for (const middleware of this.middlewares) {
      processedEvent = await middleware(processedEvent);
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
  emitSync(eventObj: AukEvent): boolean {
    return this.emitSyncInternal(eventObj);
  }

  /**
   * Emit an event with a specific shape.
   * @param eventObj - The event object to emit.
   * @returns True if the event had listeners, false otherwise.
   */
  async emit(eventObj: AukEvent): Promise<boolean> {
    // Fast path: skip validation and async processing when no middleware
    if (!this.hasMiddleware) {
      return this.emitSyncInternal(eventObj);
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

    const processedEvent = await this.applyMiddleware(eventObj);
    return this.emitSyncInternal(processedEvent);
  }

  /**
   * Register an event listener. Supports wildcard patterns.
   * @param event - The event name or wildcard pattern (e.g., "user.*", "*.created", "*")
   * @param listener - The listener function.
   * @returns The AukBus instance.
   */
  on(event: string, listener: (data: EventData) => void): this {
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
  off(event: string, listener: (data: EventData) => void): this {
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
  once(event: string, listener: (data: EventData) => void): this {
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
}

/**
 * Get the global Auk configuration singleton.
 * @throws If the config is not initialized.
 * @returns The required AukConfig object.
 */
let _globalAukConfig: Required<AukConfig> | undefined;
export function getAukConfig(): Required<AukConfig> {
  if (!_globalAukConfig) throw new Error("Auk config not initialized");
  return _globalAukConfig;
}

/**
 * Get the name of a plugin.
 * @param plugin - The plugin object or function.
 * @returns The plugin name.
 */
function getPluginName(plugin: AukPlugin): string {
  if (typeof plugin === "function") return plugin.name || "anonymous-plugin";
  return plugin.name;
}
/**
 * Get the name of a module.
 * @param mod - The module object or function.
 * @returns The module name.
 */
function getModuleName(mod: AukModule): string {
  if (typeof mod === "function") return mod.name || "anonymous-module";
  return mod.name;
}
/**
 * Get the plugin function from a plugin object or function.
 * @param plugin - The plugin object or function.
 * @returns The plugin function.
 */
function getPluginFn(plugin: AukPlugin): PluginFn {
  return typeof plugin === "function" ? plugin : plugin.fn;
}
/**
 * Get the module function from a module object or function.
 * @param mod - The module object or function.
 * @returns The module function.
 */
function getModuleFn(mod: AukModule): ModuleFn {
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
 */
export class Auk {
  /**
   * The Auk context object.
   */
  public context: AukContext;
  /**
   * The Auk event bus instance.
   */
  public eventBus: AukBus;
  private _plugins: { name: string; fn: PluginFn }[] = [];
  private _modules: { name: string; fn: ModuleFn }[] = [];
  private _cleanupHandlers: { name: string; fn: CleanupFn }[] = [];
  private _isShuttingDown = false;

  /**
   * Create a new Auk instance.
   * @param options - The Auk setup options.
   */
  constructor({
    config,
    logger,
    db,
    ...rest
  }: {
    config: AukConfig;
    logger: AukContext["logger"];
    db: unknown;
    [key: string]: unknown;
  }) {
    const fullConfig: Required<AukConfig> = {
      ...config,
      serviceName: config.serviceName ?? "auk-service",
      maxEventListeners: config.maxEventListeners ?? 0,
    };
    const serviceLogger = prefixLogger(logger, fullConfig.serviceName);
    this.context = {
      config: fullConfig,
      logger: serviceLogger,
      db,
      health: { status: "healthy", checks: {} },
      ...rest,
    };
    _globalAukConfig = fullConfig;
    this.eventBus = new AukBus(undefined, fullConfig.maxEventListeners);

    // Setup graceful shutdown handlers
    this.setupShutdownHandlers();
  }

  /**
   * Setup process signal handlers for graceful shutdown.
   */
  private setupShutdownHandlers() {
    const gracefulShutdown = async (signal: string) => {
      if (this._isShuttingDown) return;
      this.context.logger.info(
        `[Auk] Received ${signal}, starting graceful shutdown...`
      );
      await this.shutdown();
      process.exit(0);
    };

    process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
    process.on("SIGINT", () => gracefulShutdown("SIGINT"));
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

    this.context.logger.info("[Auk] Shutdown complete");
  }

  /**
   * Register one or more plugins.
   * @param pluginFns - The plugins to register.
   * @returns The Auk instance (for chaining).
   */
  plugins(...pluginFns: AukPlugin[]) {
    for (const plugin of pluginFns) {
      const name = getPluginName(plugin);
      if (!name) throw new Error("All plugins must have a name");
      this._plugins.push({ name, fn: getPluginFn(plugin) });
    }
    return this;
  }

  /**
   * Register one or more modules.
   * @param moduleFns - The modules to register.
   * @returns The Auk instance (for chaining).
   */
  modules(...moduleFns: AukModule[]) {
    for (const mod of moduleFns) {
      const name = getModuleName(mod);
      if (!name) throw new Error("All modules must have a name");
      this._modules.push({ name, fn: getModuleFn(mod) });
    }
    return this;
  }

  /**
   * Start the Auk service, loading modules and plugins.
   * @returns A promise that resolves when startup is complete.
   */
  async start() {
    // Register modules (listeners) first
    for (const { name, fn } of this._modules) {
      const contextWithLogger = {
        ...this.context,
        logger: prefixLogger(this.context.logger, name),
      };
      fn(this.eventBus, contextWithLogger);
      this.context.logger.info(`[Auk] Module loaded: ${name}`);
    }
    // Then run plugins (emitters)
    for (const { name, fn } of this._plugins) {
      const contextWithLogger = {
        ...this.context,
        logger: prefixLogger(this.context.logger, name),
      };
      await fn(contextWithLogger, this.eventBus);
      this.context.logger.info(`[Auk] Plugin loaded: ${name}`);
    }
    this.context.logger.info(
      `[Auk] Service '${this.context.config.serviceName}' started!`
    );
    return this;
  }
}
