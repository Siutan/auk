/**
 * Auk Sentry Middleware
 *
 * Usage:
 *   import { sentryMiddleware } from "@/addons/sentry-middleware";
 *   auk.middleware(sentryMiddleware({ dsn: "..." }));
 *
 * This middleware captures errors in the Auk event pipeline and reports them to Sentry.
 */

import type { AdvancedMiddlewareFn, AukEvent } from "core";
import * as Sentry from "@sentry/bun";

let sentryInitialized = false;

export function sentryMiddleware(
  options: Sentry.BunOptions
): AdvancedMiddlewareFn {
  if (!sentryInitialized) {
    Sentry.init(options);
    sentryInitialized = true;
  }

  return async (event: AukEvent, context, next) => {
    try {
      return await next();
    } catch (error) {
      Sentry.withScope((scope) => {
        scope.setTag("auk.event", event.event);
        // biome-ignore lint/suspicious/noExplicitAny: <data is dependant on the event schema>
        scope.setContext("event.data", event.data as Record<string, any>);
        scope.setContext("auk.metadata", context.metadata);
        scope.setContext("auk.env", {
          environment: options.environment || process.env.NODE_ENV,
          isDistributed: context.isDistributed,
        });
        Sentry.captureException(error);
      });
      throw error;
    }
  };
}
