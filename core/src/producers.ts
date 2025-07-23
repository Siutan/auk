import type { Static, TSchema } from "@sinclair/typebox";
import type { AukContext } from "./config.js";

/**
 * Type-safe emit function that constrains events to the available schemas.
 */
export type TypedEmitFn<EventSchemas extends Record<string, TSchema>> = <
  E extends keyof EventSchemas
>(
  event: E,
  payload: Static<EventSchemas[E]>
) => void;

/**
 * Required producer handler function used internally by Auk.
 * @template Schema - The TypeBox schema for the event data
 * @template Context - The context type (extends AukContext)
 * @template EventSchemas - All available event schemas for type-safe emit
 */
export type RequiredProducerHandler<
  Schema extends TSchema,
  Context extends AukContext = AukContext,
  EventSchemas extends Record<string, TSchema> = {}
> =
  | ((args: {
      payload: Static<Schema>;
      ctx: Context;
      emit: TypedEmitFn<EventSchemas>;
    }) => void | Promise<void>)
  | ((args: { payload: Static<Schema> }) => void | Promise<void>);

/**
 * Consumer function signature.
 * Consumers are event listeners that process events in the system.
 * @template Schema - The TypeBox schema for the event data
 * @template Context - The context type
 */
export type ConsumerFn<
  Schema extends TSchema,
  Context extends AukContext = AukContext
> = (data: Static<Schema>, context: Context) => void | Promise<void>;

// Legacy types kept for backward compatibility
export type ProducerFn<
  EventName extends keyof EventSchemas,
  EventSchemas extends Record<string, TSchema>,
  Context extends AukContext = AukContext
> = <E extends EventName>(
  event: E,
  opts: {
    handler: RequiredProducerHandler<EventSchemas[E], Context, EventSchemas>;
  }
) => void | Promise<void>;
