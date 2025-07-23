import type { TriggerSource } from "../triggers.js";

/**
 * Create a cron-based trigger source.
 * Note: This is a basic implementation. In production, you might want to use a proper cron library.
 *
 * @param expr - Cron expression (simplified: only supports basic intervals for demo)
 * @returns TriggerSource that fires on the cron schedule
 * @internal This is a basic implementation for demo/testing only. Not intended for production use.
 */
export function cron(expr: string): TriggerSource<void> {
  return {
    subscribe(listener) {
      // Simple cron implementation for demo purposes
      // In production, use a proper cron library like node-cron

      let interval: NodeJS.Timeout;

      // Parse basic cron expressions
      if (expr === "0 9 * * *") {
        // Daily at 9 AM - for demo, run every 10 seconds
        interval = setInterval(async () => {
          try {
            await listener();
          } catch (err) {
            console.error("[cron] handler error", err);
          }
        }, 10000);
      } else if (expr.startsWith("*/")) {
        // Every N seconds/minutes - extract the number and check position
        const parts = expr.split("/")[1]?.split(" ")[0];
        const value = parts ? Number.parseInt(parts) : 30; // Default to 30 seconds if parsing fails

        // Check if this is the first field (seconds) or second field (minutes)
        const fields = expr.split(" ");
        const isSeconds = fields.length >= 6; // 6-field cron includes seconds

        const ms = isSeconds ? value * 1000 : value * 60 * 1000;
        interval = setInterval(async () => {
          try {
            await listener();
          } catch (err) {
            console.error("[cron] handler error", err);
          }
        }, ms);
      } else {
        // Default: every 30 seconds for demo
        interval = setInterval(async () => {
          try {
            await listener();
          } catch (err) {
            console.error("[cron] handler error", err);
          }
        }, 30000);
      }

      // Return cleanup function
      return () => {
        if (interval) {
          clearInterval(interval);
        }
      };
    },
  };
}
