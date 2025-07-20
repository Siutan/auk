/** biome-ignore-all lint/suspicious/noExplicitAny: <any is needed for type inference> */
import type { AdvancedMiddlewareFn, AukEvent, MiddlewareFn } from "../index.js";

/**
 * Enhanced middleware context with additional utilities.
 */
export interface MiddlewareContext {
  /** Event metadata */
  metadata: {
    messageId?: string;
    attemptCount: number;
    timestamp: number;
    delivery?: "queue" | "broadcast";
    [key: string]: any;
  };
  /** Lifecycle hooks */
  hooks: any;
  /** Delivery mode */
  delivery?: "queue" | "broadcast";
  /** Whether running in distributed mode */
  isDistributed: boolean;
  /** Middleware-specific state */
  state: Record<string, any>;
  /** Add data that persists through the middleware chain */
  set: (key: string, value: any) => void;
  /** Get data from the middleware chain */
  get: (key: string) => any;
}

/**
 * Middleware factory function type.
 */
export type MiddlewareFactory<T = any> = (
  options?: T
) => MiddlewareFn | AdvancedMiddlewareFn;

/**
 * Logging middleware options.
 */
export interface LoggingOptions {
  /** Log level: 'debug' | 'info' | 'warn' | 'error' */
  level?: "debug" | "info" | "warn" | "error";
  /** Include event data in logs */
  includeData?: boolean;
  /** Include metadata in logs */
  includeMetadata?: boolean;
  /** Custom logger function */
  logger?: {
    debug: (message: string, data?: any) => void;
    info: (message: string, data?: any) => void;
    warn: (message: string, data?: any) => void;
    error: (message: string, data?: any) => void;
  };
  /** Filter events to log (by event name pattern) */
  filter?: (eventName: string) => boolean;
}

/**
 * Rate limiting middleware options.
 */
export interface RateLimitOptions {
  /** Maximum requests per window */
  maxRequests: number;
  /** Time window in milliseconds */
  windowMs: number;
  /** Key function to group requests */
  keyGenerator?: (event: AukEvent) => string;
  /** What to do when rate limit is exceeded */
  onExceeded?: (event: AukEvent) => void;
  /** Skip rate limiting for certain events */
  skip?: (event: AukEvent) => boolean;
}

/**
 * Validation middleware options.
 */
export interface ValidationOptions {
  /** Validation schema or function */
  schema?: any;
  /** Custom validation function */
  validate?: (data: any) => boolean | string;
  /** Whether to throw on validation failure */
  throwOnError?: boolean;
  /** Transform data after validation */
  transform?: (data: any) => any;
}

/**
 * Retry middleware options.
 */
export interface RetryOptions {
  /** Maximum retry attempts */
  maxAttempts: number;
  /** Backoff strategy */
  backoff?: "linear" | "exponential" | "fixed";
  /** Base delay in milliseconds */
  baseDelay?: number;
  /** Maximum delay in milliseconds */
  maxDelay?: number;
  /** Jitter factor (0-1) */
  jitter?: number;
  /** Which errors should trigger retry */
  retryOn?: (error: Error) => boolean;
}

/**
 * Metrics middleware options.
 */
export interface MetricsOptions {
  /** Metrics collector */
  collector?: {
    increment: (metric: string, labels?: Record<string, string>) => void;
    timing: (
      metric: string,
      duration: number,
      labels?: Record<string, string>
    ) => void;
    gauge: (
      metric: string,
      value: number,
      labels?: Record<string, string>
    ) => void;
  };
  /** Include event-specific metrics */
  includeEventMetrics?: boolean;
  /** Include timing metrics */
  includeTiming?: boolean;
}

/**
 * Logging middleware - logs events passing through the system.
 */
export function logging(options: LoggingOptions = {}): AdvancedMiddlewareFn {
  const {
    level = "info",
    includeData = false,
    includeMetadata = false,
    logger = console,
    filter,
  } = options;

  return async (event: AukEvent, context, next) => {
    const start = performance.now();

    // Skip if filter doesn't match
    if (filter && !filter(event.event)) {
      return await next();
    }

    const logData: any = {
      event: event.event,
      timestamp: new Date().toISOString(),
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

      logger[level](`[Middleware] Event processed: ${event.event}`, {
        ...logData,
        duration: `${duration.toFixed(2)}ms`,
        success: true,
      });

      return result;
    } catch (error) {
      const duration = performance.now() - start;

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
 * Rate limiting middleware - prevents too many events in a time window.
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

  return async (event: AukEvent, context, next) => {
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
      if (onExceeded) {
        onExceeded(event);
      }
      throw new Error(`Rate limit exceeded for key: ${key}`);
    }

    // Increment count and update window
    currentWindow.count++;
    windows.set(key, currentWindow);

    return await next();
  };
}

/**
 * Validation middleware - validates event data against schema or function.
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

    // Schema validation (basic example - you'd integrate with your schema library)
    if (schema && isValid) {
      // This is a placeholder - in real implementation you'd use TypeBox, Zod, etc.
      try {
        // Assume schema has a validate method
        if (schema.validate && !schema.validate(event.data)) {
          isValid = false;
          errorMessage = "Schema validation failed";
        }
      } catch (error) {
        isValid = false;
        errorMessage =
          error instanceof Error ? error.message : "Schema validation error";
      }
    }

    if (!isValid && throwOnError) {
      throw new Error(`Validation error: ${errorMessage}`);
    }

    // Transform data if provided
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
 * Metrics middleware - collects performance and usage metrics.
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
      const key = labels
        ? `${metric}_duration:${JSON.stringify(labels)}`
        : `${metric}_duration`;
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

  return async (event: AukEvent, context, next) => {
    const start = performance.now();

    // Increment event counter
    if (includeEventMetrics) {
      metricsCollector.increment("events_total", { event: event.event });
    }

    try {
      const result = await next();

      // Record timing
      if (includeTiming) {
        const duration = performance.now() - start;
        metricsCollector.timing("event_duration", duration, {
          event: event.event,
        });
      }

      // Increment success counter
      if (includeEventMetrics) {
        metricsCollector.increment("events_success", { event: event.event });
      }

      return result;
    } catch (error) {
      // Record timing even on error
      if (includeTiming) {
        const duration = performance.now() - start;
        metricsCollector.timing("event_duration", duration, {
          event: event.event,
          status: "error",
        });
      }

      // Increment error counter
      if (includeEventMetrics) {
        metricsCollector.increment("events_error", { event: event.event });
      }

      throw error;
    }
  };
}

/**
 * Timing middleware - adds timing information to events.
 */
export function timing(): AdvancedMiddlewareFn {
  return async (event: AukEvent, context, next) => {
    const start = performance.now();

    try {
      const result = await next();

      // Add timing info to the result
      const duration = performance.now() - start;
      const endTime = performance.now();

      return {
        ...result,
        data: {
          ...(result.data as Record<string, any>),
          _timing: {
            startTime: start,
            duration,
            endTime,
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
 * Correlation ID middleware - adds correlation IDs for request tracing.
 */
export function correlationId(
  options: {
    generator?: () => string;
    header?: string;
  } = {}
): MiddlewareFn {
  const {
    generator = () =>
      `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
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
 * Circuit breaker middleware - prevents cascading failures.
 */
export function circuitBreaker(options: {
  failureThreshold: number;
  resetTimeout: number;
  monitoringPeriod: number;
}): AdvancedMiddlewareFn {
  const { failureThreshold, resetTimeout, monitoringPeriod } = options;

  let state: "closed" | "open" | "half-open" = "closed";
  let failures = 0;
  let lastFailureTime = 0;
  let nextAttempt = 0;

  return async (event: AukEvent, context, next) => {
    const now = Date.now();

    // Reset failure count if monitoring period has passed
    if (now - lastFailureTime > monitoringPeriod) {
      failures = 0;
    }

    // Check circuit state
    if (state === "open") {
      if (now < nextAttempt) {
        throw new Error("Circuit breaker is open");
      } else {
        state = "half-open";
      }
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
 * Compose multiple middleware functions into one.
 */
export function compose(
  ...middlewares: Array<MiddlewareFn | AdvancedMiddlewareFn>
): AdvancedMiddlewareFn {
  return async (event: AukEvent, context, next) => {
    let index = -1;

    async function dispatch(
      i: number,
      currentEvent: AukEvent
    ): Promise<AukEvent> {
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
        // Simple middleware - transform the event and continue with transformed event
        const transformedEvent = await (middleware as MiddlewareFn)(
          currentEvent
        );
        return await dispatch(i + 1, transformedEvent);
      } else {
        // Advanced middleware - pass the current event and let it call next
        return await (middleware as AdvancedMiddlewareFn)(
          currentEvent,
          context,
          async () => {
            // Continue with the next middleware, passing the current event
            return await dispatch(i + 1, currentEvent);
          }
        );
      }
    }

    return await dispatch(0, event);
  };
}

// Export commonly used middleware for convenience
export const commonMiddleware = {
  logging,
  rateLimit,
  validation,
  metrics,
  timing,
  correlationId,
  circuitBreaker,
  compose,
};

export default commonMiddleware;
