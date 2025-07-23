/** biome-ignore-all lint/suspicious/noExplicitAny: <any is needed for type inference> */
import type { AukEvent, Delivery, CleanupFn } from "./types.js";
import type { MessageMetadata, LifecycleHooks } from "./lifecycle.js";

/**
 * Middleware function signature for simple event transformation.
 */
export type MiddlewareFn = (event: AukEvent) => AukEvent | Promise<AukEvent>;

/**
 * Enhanced middleware context with lifecycle hooks and utilities.
 */
export interface MiddlewareContext {
  /** Message metadata including ID, attempt count, timestamp */
  metadata: MessageMetadata;
  /** Lifecycle hooks for event processing stages */
  hooks: LifecycleHooks;
  /** Delivery mode for distributed events */
  delivery?: Delivery;
  /** Whether running in distributed mode */
  isDistributed: boolean;
  /** Middleware-specific state storage */
  state: Record<string, any>;
  /** Store data that persists through the middleware chain */
  set: (key: string, value: any) => void;
  /** Retrieve data from the middleware chain */
  get: (key: string) => any;
  /** Register cleanup handlers for graceful shutdown */
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
 * Middleware factory function type for creating configurable middleware.
 */
export type MiddlewareFactory<TOptions = any> = (
  options?: TOptions
) => MiddlewareFn | AdvancedMiddlewareFn;

/**
 * Logging middleware configuration options.
 */
export interface LoggingOptions {
  /** Log level threshold */
  level?: "debug" | "info" | "warn" | "error";
  /** Include event data in logs */
  includeData?: boolean;
  /** Include metadata in logs */
  includeMetadata?: boolean;
  /** Custom logger implementation */
  logger?: {
    debug: (message: string, data?: any) => void;
    info: (message: string, data?: any) => void;
    warn: (message: string, data?: any) => void;
    error: (message: string, data?: any) => void;
  };
  /** Filter events to log by event name */
  filter?: (eventName: string) => boolean;
}

/**
 * Rate limiting middleware configuration options.
 */
export interface RateLimitOptions {
  /** Maximum requests allowed per window */
  maxRequests: number;
  /** Time window duration in milliseconds */
  windowMs: number;
  /** Function to generate grouping keys for rate limiting */
  keyGenerator?: (event: AukEvent) => string;
  /** Handler for when rate limit is exceeded */
  onExceeded?: (event: AukEvent) => void;
  /** Function to skip rate limiting for specific events */
  skip?: (event: AukEvent) => boolean;
}

/**
 * Validation middleware configuration options.
 */
export interface ValidationOptions {
  /** Validation schema (TypeBox, Zod, etc.) */
  schema?: any;
  /** Custom validation function */
  validate?: (data: any) => boolean | string;
  /** Whether to throw on validation failure */
  throwOnError?: boolean;
  /** Transform data after successful validation */
  transform?: (data: any) => any;
}

/**
 * Retry middleware configuration options.
 */
export interface RetryOptions {
  /** Maximum number of retry attempts */
  maxAttempts: number;
  /** Backoff strategy for retry delays */
  backoff?: "linear" | "exponential" | "fixed";
  /** Base delay in milliseconds */
  baseDelay?: number;
  /** Maximum delay cap in milliseconds */
  maxDelay?: number;
  /** Jitter factor for randomizing delays (0-1) */
  jitter?: number;
  /** Predicate to determine if error should trigger retry */
  retryOn?: (error: Error) => boolean;
}

/**
 * Metrics collection middleware configuration options.
 */
export interface MetricsOptions {
  /** Custom metrics collector implementation */
  collector?: {
    increment: (metric: string, labels?: Record<string, string>) => void;
    timing: (metric: string, duration: number, labels?: Record<string, string>) => void;
    gauge: (metric: string, value: number, labels?: Record<string, string>) => void;
  };
  /** Include event-specific metrics */
  includeEventMetrics?: boolean;
  /** Include timing metrics */
  includeTiming?: boolean;
}

/**
 * Circuit breaker middleware configuration options.
 */
export interface CircuitBreakerOptions {
  /** Number of failures before opening circuit */
  failureThreshold: number;
  /** Time to wait before attempting reset (ms) */
  resetTimeout: number;
  /** Period to monitor for failures (ms) */
  monitoringPeriod: number;
}

/**
 * Correlation ID middleware configuration options.
 */
export interface CorrelationIdOptions {
  /** Function to generate correlation IDs */
  generator?: () => string;
  /** Header name for correlation ID */
  header?: string;
}

/**
 * Distributed tracing middleware configuration options.
 */
export interface TracingOptions {
  /** Service name for tracing */
  serviceName?: string;
  /** Custom trace ID generator */
  traceIdGenerator?: () => string;
  /** Custom span ID generator */
  spanIdGenerator?: () => string;
  /** Include event data in traces */
  includeEventData?: boolean;
}

/**
 * Error monitoring middleware configuration options.
 */
export interface ErrorMonitoringOptions {
  /** Error reporting service */
  reporter?: {
    captureException: (error: Error, context?: any) => void;
    captureMessage: (message: string, level?: string, context?: any) => void;
  };
  /** Include event context in error reports */
  includeEventContext?: boolean;
  /** Filter errors to report */
  shouldReport?: (error: Error, event: AukEvent) => boolean;
}

/**
 * Logging middleware - provides comprehensive event logging with configurable levels.
 */
export function logging(options: LoggingOptions = {}): AdvancedMiddlewareFn {
  const {
    level = "info",
    includeData = false,
    includeMetadata = false,
    logger = console,
    filter,
  } = options;

  return async (
    event: AukEvent,
    context: MiddlewareContext,
    next: () => Promise<AukEvent>
  ) => {
    const start = performance.now();

    // Skip if filter doesn't match
    if (filter && !filter(event.event)) {
      return await next();
    }

    const logData: any = {
      event: event.event,
      timestamp: new Date().toISOString(),
      messageId: context.metadata.messageId,
      attemptCount: context.metadata.attemptCount,
      isDistributed: context.isDistributed,
    };

    if (includeData) {
      logData.data = event.data;
    }

    if (includeMetadata) {
      logData.metadata = context.metadata;
    }

    logger[level](`[Middleware] Processing event: ${event.event}`, logData);

    try {
      const result = await next();
      const duration = performance.now() - start;

      // Call success hook if available
      if (context.hooks.onSuccess) {
        await context.hooks.onSuccess(result, context.metadata);
      }

      logger[level](`[Middleware] Event processed: ${event.event}`, {
        ...logData,
        duration: `${duration.toFixed(2)}ms`,
        success: true,
      });

      return result;
    } catch (error) {
      const duration = performance.now() - start;

      // Call failure hook if available
      if (context.hooks.onFailed && error instanceof Error) {
        await context.hooks.onFailed(event, error, context.metadata);
      }

      logger.error(`[Middleware] Event failed: ${event.event}`, {
        ...logData,
        duration: `${duration.toFixed(2)}ms`,
        error: error instanceof Error ? error.message : String(error),
        success: false,
      });

      throw error;
    }
  };
}

/**
 * Rate limiting middleware - prevents event flooding with configurable windows.
 */
export function rateLimit(options: RateLimitOptions): AdvancedMiddlewareFn {
  const {
    maxRequests,
    windowMs,
    keyGenerator = () => "global",
    onExceeded,
    skip,
  } = options;

  const windows = new Map<string, { count: number; resetTime: number }>();

  return async (
    event: AukEvent,
    context: MiddlewareContext,
    next: () => Promise<AukEvent>
  ) => {
    // Skip if configured
    if (skip?.(event)) {
      return await next();
    }

    const key = keyGenerator(event);
    const now = Date.now();
    const window = windows.get(key);

    // Clean up expired windows
    if (window && now > window.resetTime) {
      windows.delete(key);
    }

    // Get or create current window
    const currentWindow = windows.get(key) || {
      count: 0,
      resetTime: now + windowMs,
    };

    // Check rate limit
    if (currentWindow.count >= maxRequests) {
      const rateLimitError = new Error(`Rate limit exceeded for key: ${key}`);
      
      if (onExceeded) {
        onExceeded(event);
      }

      // Call failure hook for rate limit exceeded
      if (context.hooks.onFailed) {
        await context.hooks.onFailed(event, rateLimitError, context.metadata);
      }

      throw rateLimitError;
    }

    // Increment count and update window
    currentWindow.count++;
    windows.set(key, currentWindow);

    return await next();
  };
}

/**
 * Validation middleware - validates event data with comprehensive error handling.
 */
export function validation(options: ValidationOptions): MiddlewareFn {
  const { schema, validate, throwOnError = true, transform } = options;

  return (event: AukEvent) => {
    let isValid = true;
    let errorMessage = "";

    // Custom validation function
    if (validate) {
      const result = validate(event.data);
      if (typeof result === "boolean") {
        isValid = result;
        errorMessage = "Validation failed";
      } else if (typeof result === "string") {
        isValid = false;
        errorMessage = result;
      }
    }

    // Schema validation (supports TypeBox, Zod, etc.)
    if (schema && isValid) {
      try {
        // TypeBox validation
        if (schema.Check && !schema.Check(event.data)) {
          isValid = false;
          errorMessage = "Schema validation failed";
        }
        // Generic validation method
        else if (schema.validate && !schema.validate(event.data)) {
          isValid = false;
          errorMessage = "Schema validation failed";
        }
        // Zod-style validation
        else if (schema.safeParse) {
          const result = schema.safeParse(event.data);
          if (!result.success) {
            isValid = false;
            errorMessage = result.error?.message || "Schema validation failed";
          }
        }
      } catch (error) {
        isValid = false;
        errorMessage = error instanceof Error ? error.message : "Schema validation error";
      }
    }

    if (!isValid && throwOnError) {
      throw new Error(`Validation error: ${errorMessage}`);
    }

    // Transform data if provided and validation passed
    let processedEvent = event;
    if (transform && isValid) {
      processedEvent = {
        ...event,
        data: transform(event.data),
      };
    }

    return processedEvent;
  };
}

/**
 * Metrics middleware - collects comprehensive performance and usage metrics.
 */
export function metrics(options: MetricsOptions = {}): AdvancedMiddlewareFn {
  const {
    collector,
    includeEventMetrics = true,
    includeTiming = true,
  } = options;

  // Default in-memory metrics collector
  const defaultCollector = {
    metrics: new Map<string, number>(),
    increment(metric: string, labels?: Record<string, string>) {
      const key = labels ? `${metric}:${JSON.stringify(labels)}` : metric;
      this.metrics.set(key, (this.metrics.get(key) || 0) + 1);
    },
    timing(metric: string, duration: number, labels?: Record<string, string>) {
      const key = labels ? `${metric}_duration:${JSON.stringify(labels)}` : `${metric}_duration`;
      this.metrics.set(key, duration);
    },
    gauge(metric: string, value: number, labels?: Record<string, string>) {
      const key = labels ? `${metric}:${JSON.stringify(labels)}` : metric;
      this.metrics.set(key, value);
    },
    getMetrics() {
      return Object.fromEntries(this.metrics);
    },
  };

  const metricsCollector = collector || defaultCollector;

  return async (
    event: AukEvent,
    context: MiddlewareContext,
    next: () => Promise<AukEvent>
  ) => {
    const start = performance.now();
    const labels = {
      event: event.event,
      distributed: context.isDistributed.toString(),
      delivery: context.delivery || "unknown",
    };

    // Increment event counter
    if (includeEventMetrics) {
      metricsCollector.increment("events_total", labels);
      metricsCollector.increment("events_by_attempt", {
        ...labels,
        attempt: context.metadata.attemptCount.toString(),
      });
    }

    try {
      const result = await next();

      // Record timing
      if (includeTiming) {
        const duration = performance.now() - start;
        metricsCollector.timing("event_duration", duration, labels);
      }

      // Increment success counter
      if (includeEventMetrics) {
        metricsCollector.increment("events_success", labels);
      }

      return result;
    } catch (error) {
      // Record timing even on error
      if (includeTiming) {
        const duration = performance.now() - start;
        metricsCollector.timing("event_duration", duration, {
          ...labels,
          status: "error",
        });
      }

      // Increment error counter
      if (includeEventMetrics) {
        metricsCollector.increment("events_error", {
          ...labels,
          error_type: error instanceof Error ? error.constructor.name : "unknown",
        });
      }

      throw error;
    }
  };
}

/**
 * Circuit breaker middleware - prevents cascading failures with state management.
 */
export function circuitBreaker(options: CircuitBreakerOptions): AdvancedMiddlewareFn {
  const { failureThreshold, resetTimeout, monitoringPeriod } = options;

  let state: "closed" | "open" | "half-open" = "closed";
  let failures = 0;
  let lastFailureTime = 0;
  let nextAttempt = 0;

  return async (
    event: AukEvent,
    context: MiddlewareContext,
    next: () => Promise<AukEvent>
  ) => {
    const now = Date.now();

    // Reset failure count if monitoring period has passed
    if (now - lastFailureTime > monitoringPeriod) {
      failures = 0;
    }

    // Check circuit state
    if (state === "open") {
      if (now < nextAttempt) {
        const circuitError = new Error("Circuit breaker is open");
        
        // Call failure hook for circuit breaker
        if (context.hooks.onFailed) {
          await context.hooks.onFailed(event, circuitError, context.metadata);
        }
        
        throw circuitError;
      }
      state = "half-open";
    }

    try {
      const result = await next();

      // Success resets the circuit
      if (state === "half-open") {
        state = "closed";
        failures = 0;
      }

      return result;
    } catch (error) {
      failures++;
      lastFailureTime = now;

      // Open circuit if threshold exceeded
      if (failures >= failureThreshold) {
        state = "open";
        nextAttempt = now + resetTimeout;
      }

      throw error;
    }
  };
}

/**
 * Correlation ID middleware - adds request tracing capabilities.
 */
export function correlationId(options: CorrelationIdOptions = {}): MiddlewareFn {
  const {
    generator = () => `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    header = "correlationId",
  } = options;

  return (event: AukEvent) => {
    const correlationId = generator();

    return {
      ...event,
      data: {
        ...(event.data as Record<string, any>),
        [header]: correlationId,
      },
    };
  };
}

/**
 * Distributed tracing middleware - provides comprehensive tracing for distributed systems.
 */
export function tracing(options: TracingOptions = {}): AdvancedMiddlewareFn {
  const {
    serviceName = "auk-service",
    traceIdGenerator = () => Math.random().toString(36).substr(2, 16),
    spanIdGenerator = () => Math.random().toString(36).substr(2, 8),
    includeEventData = false,
  } = options;

  return async (
    event: AukEvent,
    context: MiddlewareContext,
    next: () => Promise<AukEvent>
  ) => {
    const traceId = traceIdGenerator();
    const spanId = spanIdGenerator();
    const startTime = performance.now();

    // Add tracing context to event
    const tracedEvent = {
      ...event,
      data: {
        ...(event.data as Record<string, any>),
        _trace: {
          traceId,
          spanId,
          serviceName,
          startTime,
          isDistributed: context.isDistributed,
          delivery: context.delivery,
        },
      },
    };

    // Store trace info in context
    context.set("traceId", traceId);
    context.set("spanId", spanId);

    try {
      const result = await next();
      const duration = performance.now() - startTime;

      // Add completion info to trace
      const finalResult = {
        ...result,
        data: {
          ...(result.data as Record<string, any>),
          _trace: {
            ...(result.data as any)?._trace,
            duration,
            status: "success",
            endTime: performance.now(),
          },
        },
      };

      return finalResult;
    } catch (error) {
      const duration = performance.now() - startTime;

      // Add error info to trace context for debugging
      context.set("traceError", {
        message: error instanceof Error ? error.message : String(error),
        duration,
        status: "error",
      });

      throw error;
    }
  };
}

/**
 * Error monitoring middleware - integrates with error reporting services.
 */
export function errorMonitoring(options: ErrorMonitoringOptions = {}): AdvancedMiddlewareFn {
  const {
    reporter,
    includeEventContext = true,
    shouldReport = () => true,
  } = options;

  // Default console reporter
  const defaultReporter = {
    captureException: (error: Error, context?: any) => {
      console.error("[Error Monitoring] Exception captured:", error, context);
    },
    captureMessage: (message: string, level = "error", context?: any) => {
      console.log(`[Error Monitoring] ${level.toUpperCase()}: ${message}`, context);
    },
  };

  const errorReporter = reporter || defaultReporter;

  return async (
    event: AukEvent,
    context: MiddlewareContext,
    next: () => Promise<AukEvent>
  ) => {
    try {
      return await next();
    } catch (error) {
      if (error instanceof Error && shouldReport(error, event)) {
        const errorContext = {
          event: event.event,
          messageId: context.metadata.messageId,
          attemptCount: context.metadata.attemptCount,
          timestamp: context.metadata.timestamp,
          isDistributed: context.isDistributed,
          delivery: context.delivery,
          traceId: context.get("traceId"),
          spanId: context.get("spanId"),
        };

        if (includeEventContext) {
          (errorContext as any).eventData = event.data;
        }

        errorReporter.captureException(error, errorContext);
      }

      throw error;
    }
  };
}

/**
 * Timing middleware - adds comprehensive timing information to events.
 */
export function timing(): AdvancedMiddlewareFn {
  return async (
    event: AukEvent,
    context: MiddlewareContext,
    next: () => Promise<AukEvent>
  ) => {
    const start = performance.now();
    const startTime = Date.now();

    try {
      const result = await next();
      const duration = performance.now() - start;
      const endTime = Date.now();

      // Add timing info to the result
      return {
        ...result,
        data: {
          ...(result.data as Record<string, any>),
          _timing: {
            startTime,
            endTime,
            duration,
            processingTime: duration,
            messageId: context.metadata.messageId,
            attemptCount: context.metadata.attemptCount,
          },
        },
      };
    } catch (error) {
      // Don't add timing info on error, just rethrow
      throw error;
    }
  };
}

/**
 * Compose multiple middleware functions into a single middleware chain.
 */
export function compose(
  ...middlewares: Array<MiddlewareFn | AdvancedMiddlewareFn>
): AdvancedMiddlewareFn {
  return async (
    event: AukEvent,
    context: MiddlewareContext,
    next: () => Promise<AukEvent>
  ) => {
    let index = -1;

    async function dispatch(i: number, currentEvent: AukEvent): Promise<AukEvent> {
      if (i <= index) {
        throw new Error("next() called multiple times");
      }
      index = i;

      // If we've processed all middleware, call the original next
      if (i >= middlewares.length) {
        return await next();
      }

      const middleware = middlewares[i];
      if (!middleware) {
        return currentEvent;
      }

      // Handle both simple and advanced middleware
      if (middleware.length === 1) {
        // Simple middleware - transform the event and continue
        const transformedEvent = await (middleware as MiddlewareFn)(currentEvent);
        return await dispatch(i + 1, transformedEvent);
      }
      
      // Advanced middleware - pass context and next function
      return await (middleware as AdvancedMiddlewareFn)(
        currentEvent,
        context,
        async () => await dispatch(i + 1, currentEvent)
      );
    }

    return await dispatch(0, event);
  };
}

/**
 * Retry middleware - implements configurable retry logic with backoff strategies.
 */
export function retry(options: RetryOptions): AdvancedMiddlewareFn {
  const {
    maxAttempts,
    backoff = "exponential",
    baseDelay = 1000,
    maxDelay = 30000,
    jitter = 0.1,
    retryOn = () => true,
  } = options;

  const calculateDelay = (attempt: number): number => {
    let delay: number;
    
    switch (backoff) {
      case "linear":
        delay = baseDelay * attempt;
        break;
      case "exponential":
        delay = baseDelay * Math.pow(2, attempt - 1);
        break;
      case "fixed":
      default:
        delay = baseDelay;
        break;
    }

    // Apply jitter
    if (jitter > 0) {
      const jitterAmount = delay * jitter * Math.random();
      delay += jitterAmount;
    }

    return Math.min(delay, maxDelay);
  };

  return async (
    event: AukEvent,
    context: MiddlewareContext,
    next: () => Promise<AukEvent>
  ) => {
    let lastError: Error | null = null;
    
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        // Call retry hook if available and not first attempt
        if (attempt > 1 && context.hooks.onRetry) {
          await context.hooks.onRetry(event, attempt, context.metadata);
        }

        return await next();
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        
        // Check if we should retry this error
        if (!retryOn(lastError) || attempt >= maxAttempts) {
          throw lastError;
        }

        // Calculate and apply delay before next attempt
        const delay = calculateDelay(attempt);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }

    // This should never be reached, but TypeScript requires it
    throw lastError || new Error("Retry failed");
  };
}

/**
 * Export commonly used middleware for convenience.
 */
export const commonMiddleware = {
  logging,
  rateLimit,
  validation,
  metrics,
  circuitBreaker,
  correlationId,
  tracing,
  errorMonitoring,
  timing,
  retry,
  compose,
};

export default commonMiddleware;