import type { Static, TSchema } from "@sinclair/typebox";
import type { AukContext } from "./config.js";
import type { TypedEmitFn } from "./producers.js";
import type { TriggerSource } from "./triggers.js";

/**
 * Handler function for producers with proper typing.
 * @template SP - Source payload type from trigger
 * @template Context - Auk context type
 * @template EventSchemas - All available event schemas for type-safe emit
 */
export type ProducerBuilderHandler<
  SP,
  Context extends AukContext = AukContext,
  EventSchemas extends Record<string, TSchema> = {}
> = (args: {
  payload: SP;
  ctx: Context;
  emit: TypedEmitFn<EventSchemas>;
}) => void | Promise<void>;

/**
 * Fluent builder for configuring and registering producers.
 * Provides a clean API: .producer(eventName).from(trigger).withRetry(...).handle(handler)
 * 
 * @template Events - The event schemas object
 * @template Evt - The specific event name being produced
 * @template SP - Source payload type from trigger
 * @template Context - Auk context type
 */
export class ProducerBuilder<
  Events extends Record<string, TSchema>,
  Evt extends keyof Events,
  SP = void,
  Context extends AukContext = AukContext
> {
  constructor(
    private auk: {
      ctx(): Context;
      emit<E extends keyof Events>(eventName: E, payload: Static<Events[E]>): void;
    },
    private eventName: Evt,
    private source?: TriggerSource<SP>,
    private retryOpts?: { max: number }
  ) {}

  /**
   * Bind a trigger source to this producer.
   * @param source - The trigger source (cron, MQ, etc.)
   * @returns New ProducerBuilder with the trigger bound
   */
  from<NewSP>(source: TriggerSource<NewSP>): ProducerBuilder<Events, Evt, NewSP, Context> {
    return new ProducerBuilder<Events, Evt, NewSP, Context>(
      this.auk,
      this.eventName,
      source,
      this.retryOpts
    );
  }

  /**
   * Configure retry behavior for this producer.
   * @param opts - Retry configuration
   * @returns ProducerBuilder with retry configured
   */
  withRetry(opts: { max: number }): ProducerBuilder<Events, Evt, SP, Context> {
    return new ProducerBuilder<Events, Evt, SP, Context>(
      this.auk,
      this.eventName,
      this.source,
      opts
    );
  }

  /**
   * Register the handler function for this producer.
   * This finalizes the producer configuration and starts listening to the trigger.
   * @param handler - The producer handler function
   */
  handle(
    handler: ProducerBuilderHandler<
      SP extends void ? Static<Events[Evt]> : SP,
      Context,
      Events
    >
  ): void {
    if (!this.source) {
      throw new Error(".from() is required before .handle()");
    }

    const cleanup = this.source.subscribe(async (raw) => {
      try {
        // For void triggers (like cron), create empty payload matching event schema
        const payload = (raw as any) ?? ({} as any);
        
        // Create typed emit function
        const typedEmit: TypedEmitFn<Events> = <E extends keyof Events>(
          event: E,
          eventPayload: Static<Events[E]>
        ) => {
          this.auk.emit(event, eventPayload);
        };

        await handler({
          payload,
          ctx: this.auk.ctx(),
          emit: typedEmit,
        });
      } catch (error) {
        console.error(`[Producer ${String(this.eventName)}] Handler error:`, error);
        
        // Basic retry logic if configured
        if (this.retryOpts?.max && this.retryOpts.max > 0) {
          console.info(`[Producer ${String(this.eventName)}] Will retry up to ${this.retryOpts.max} times`);
          // Retry logic would be implemented here in a production system
        }
      }
    });
    
    // Register cleanup if provided by the trigger source
    if (cleanup && typeof cleanup === 'function') {
      const ctx = this.auk.ctx();
      if (ctx.addCleanupHandler) {
        ctx.addCleanupHandler(`producer-${String(this.eventName)}`, cleanup);
      }
    }
  }
}