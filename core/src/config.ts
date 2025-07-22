import type { CleanupFn } from "./types.js";

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
 * Context object passed to producers and consumers.
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
 * Set the global Auk configuration singleton.
 * @internal This function is for internal use by the Auk class.
 * @param config - The configuration to set.
 */
export function setAukConfig(config: Required<AukConfig>): void {
  _globalAukConfig = config;
}

/**
 * Prefixes all logger output with a given string.
 * @param baseLogger - The base logger object.
 * @param prefix - The prefix string.
 * @returns A logger object with prefixed output.
 */
export function prefixLogger(
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
