/** biome-ignore-all lint/suspicious/noExplicitAny: <data could be anything> */

import {
  type Auk,
  type Static,
  type TSchema,
  Value,
} from "../../core/src/index.js";
import type { TriggerSource } from "../../core/src/triggers.js";
import type { AzureServiceBusConfig } from "../umq/azure.js";
import { AzureServiceBusProvider } from "../umq/azure.js";
import type { UmqProvider } from "../umq/index.js";
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
  EventName extends keyof EventSchemas
>(auk: Auk<EventSchemas>, options: UmqConfigOptions) {
  return (
    eventName: EventName
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
              providerEntry?.listeners.keys() ?? []
            );
            if (eventsToSubscribe.length > 0) {
              providerEntry?.provider.subscribe(
                eventsToSubscribe,
                (data: { event: string; payload: unknown }) => {
                  const schema = auk.events[data.event];
                  if (!schema) {
                    auk.context.logger.error("Schema not found for event:", {
                      eventName: data.event,
                      availableEvents: Object.keys(auk.events),
                    });
                    return;
                  }

                  if (!Value.Check(schema, data.payload)) {
                    const errors = [...Value.Errors(schema, data.payload)];
                    auk.context.logger.error("Invalid UMQ payload:", {
                      eventName: data.event,
                      errors,
                    });
                    return;
                  }

                  const typedPayload = data.payload as Static<
                    EventSchemas[keyof EventSchemas]
                  >;
                  const eventListeners = providerEntry?.listeners.get(
                    data.event
                  );
                  if (eventListeners) {
                    for (const l of eventListeners) {
                      l(typedPayload);
                    }
                  }
                }
              );
            }
          }
        });
      }

      const eventNameStr = String(eventName);
      if (!providerEntry.listeners.has(eventNameStr)) {
        providerEntry.listeners.set(eventNameStr, new Set());
      }
      providerEntry.listeners.get(eventNameStr)?.add(listener);

      auk.context.logger.info(
        `UMQ trigger initialized: ${options.provider} for event: ${String(
          eventName
        )}`
      );



      return () => {
        providerEntry?.listeners.get(eventNameStr)?.delete(listener);
      };
      // Return an empty cleanup function

    },
  });
}
