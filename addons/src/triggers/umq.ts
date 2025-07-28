/** biome-ignore-all lint/suspicious/noExplicitAny: <data could be anything> */

import type { TriggerSource } from "@aukjs/core";
import { type Auk, type Static, type TSchema, Value } from "@aukjs/core";
import type { AzureServiceBusConfig } from "../umq/azure.js";
import { AzureServiceBusProvider } from "../umq/azure.js";
import type { UmqProvider } from "../umq/index.js";

export interface UmqMessageContext {
  ack(): Promise<void>;
  nack(): Promise<void>;
  reject(): Promise<void>;
  deliveryCount: number;
  messageId?: string;
  timestamp: Date;
}

export type UmqMessageHandler = (
  data: { event: string; payload: unknown },
  context: UmqMessageContext,
) => Promise<void>;

import type { RabbitMQConfig } from "../umq/rabbitmq.js";
import { RabbitMQProvider } from "../umq/rabbitmq.js";

/**
 * UMQ trigger configuration options - simplified to only include provider config
 */
export type UmqConfigOptions =
  | { provider: "rabbitmq"; config: RabbitMQConfig }
  | { provider: "azure"; config: AzureServiceBusConfig }
  | { provider: "kafka"; config: any };

/**
 * Creates a UMQ trigger source factory for the new producer system.
 * This replaces the deprecated umqPlugin approach.
 *
 * Usage: .from(umqTrigger(auk, options))
 * The event name is automatically inferred from the producer context.
 *
 * @param auk - The Auk instance to get event schemas from
 * @param options - UMQ configuration options
 * @returns A function that creates a TriggerSource for a specific event
 */
const umqProviderCache = new Map<
  string,
  { provider: UmqProvider; listeners: Map<string, Set<(payload: any) => void>> }
>();

/**
 * Creates a UMQ trigger source factory for the new producer system.
 * This replaces the deprecated umqPlugin approach.
 *
 * Usage: .from(umqTrigger(auk, options))
 * The event name is automatically inferred from the producer context.
 *
 * @param auk - The Auk instance to get event schemas from
 * @param options - UMQ configuration options
 * @returns A function that creates a TriggerSource for a specific event
 */
export function umqTrigger<
  EventSchemas extends Record<string, TSchema>,
  EventName extends keyof EventSchemas,
>(auk: Auk<EventSchemas>, options: UmqConfigOptions) {
  return (
    eventName: EventName,
  ): TriggerSource<Static<EventSchemas[EventName]>> => ({
    subscribe(listener) {
      const cacheKey = JSON.stringify(options);
      let providerEntry = umqProviderCache.get(cacheKey);

      if (!providerEntry) {
        let provider: UmqProvider;
        // Initialize the appropriate provider
        switch (options.provider) {
          case "rabbitmq":
            provider = new RabbitMQProvider(options.config);
            break;
          case "azure":
            provider = new AzureServiceBusProvider(options.config);
            break;
          // case "kafka":
          //   provider = new KafkaProvider(options.config);
          //   break;
          default:
            throw new Error(`Unsupported UMQ provider: ${options.provider}`);
        }
        provider.setSchemas(auk.events);
        providerEntry = { provider, listeners: new Map() };
        umqProviderCache.set(cacheKey, providerEntry);

        // Add a cleanup handler to close the provider when the app shuts down
        auk.context.addCleanupHandler(`umq-provider-${cacheKey}`, async () => {
          await providerEntry?.provider.close();
          umqProviderCache.delete(cacheKey);
        });

        // Subscribe to all registered events at once
        auk.use({
          onAukStart: () => {
            const eventsToSubscribe = Array.from(
              providerEntry?.listeners.keys() ?? [],
            );
            if (eventsToSubscribe.length > 0) {
              providerEntry?.provider.subscribe(
                eventsToSubscribe,
                async (data: { event: string; payload: unknown }, context: UmqMessageContext) => {
                  const schema = auk.events[data.event];
                  if (!schema) {
                    auk.context.logger.error("Schema not found for event:", {
                      eventName: data.event,
                      availableEvents: Object.keys(auk.events),
                    });
                    await context.reject(); // Reject unknown events
                    return;
                  }

                  if (!Value.Check(schema, data.payload)) {
                    const errors = [...Value.Errors(schema, data.payload)];
                    auk.context.logger.error("Invalid UMQ payload:", {
                      eventName: data.event,
                      errors,
                    });
                    await context.reject(); // Reject invalid payloads
                    return;
                  }

                  const typedPayload = data.payload as Static<
                    EventSchemas[keyof EventSchemas]
                  >;
                  const eventListeners = providerEntry?.listeners.get(
                    data.event,
                  );
                  
                  if (eventListeners && eventListeners.size > 0) {
                    let allSucceeded = true;
                    let shouldRetry = false;
                    
                    // Process all listeners for this event
                    for (const listener of eventListeners) {
                      try {
                        await listener(typedPayload);
                      } catch (error) {
                        allSucceeded = false;
                        auk.context.logger.error(`Consumer failed for event ${data.event}:`, {
                          error: error instanceof Error ? error.message : String(error),
                          deliveryCount: context.deliveryCount,
                        });
                        
                        // Implement retry logic based on delivery count
                        const maxRetries = 3; // Could be configurable
                        if (context.deliveryCount < maxRetries) {
                          shouldRetry = true;
                        }
                        
                        // Call onConsumeError middleware if available
                        try {
                          await (auk as any).runHook('onConsumeError', {
                            eventName: data.event as keyof EventSchemas,
                            payload: typedPayload,
                            error: error instanceof Error ? error : new Error(String(error)),
                            ctx: auk.context,
                            consumer: listener as any,
                          });
                        } catch (middlewareError) {
                          auk.context.logger.error('Middleware onConsumeError failed:', middlewareError);
                        }
                      }
                    }
                    
                    // Handle acknowledgment based on processing results
                    if (allSucceeded) {
                      await context.ack();
                      auk.context.logger.debug(`Successfully processed event ${data.event}`);
                    } else if (shouldRetry) {
                      await context.nack(); // Requeue for retry
                      auk.context.logger.warn(`Requeuing event ${data.event} for retry (attempt ${context.deliveryCount})`);
                    } else {
                      await context.reject(); // Send to DLQ after max retries
                      auk.context.logger.error(`Rejecting event ${data.event} after ${context.deliveryCount} attempts`);
                    }
                  } else {
                    // No listeners registered - acknowledge to prevent reprocessing
                    await context.ack();
                    auk.context.logger.warn(`No listeners registered for event ${data.event}, acknowledging message`);
                  }
                },
              );
            }
          },
        });
      }

      const eventNameStr = String(eventName);
      if (!providerEntry.listeners.has(eventNameStr)) {
        providerEntry.listeners.set(eventNameStr, new Set());
      }
      providerEntry.listeners.get(eventNameStr)?.add(listener);

      auk.context.logger.info(
        `UMQ trigger initialized: ${options.provider} for event: ${String(
          eventName,
        )}`,
      );

      return () => {
        providerEntry?.listeners.get(eventNameStr)?.delete(listener);
      };
      // Return an empty cleanup function
    },
  });
}
