import type { Static, TSchema } from "@sinclair/typebox";
import type { EventSchemas, Delivery } from "./types.js";
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
 * Producer handler function that receives payload, context, and emit function.
 * The `ctx` and `emit` parameters are optional. If included in the handler's
 * signature, they are guaranteed to be provided by Auk, so no non-null
 * assertions are needed.
 *
 * @example
 * // Handler with only payload
 * const handler1: ProducerHandler<MySchema> = ({ payload }) => {
 *   console.log(payload);
 * };
 *
 * @example
 * // Handler with payload, ctx, and emit
 * const handler2: ProducerHandler<MySchema, MyContext> = ({ payload, ctx, emit }) => {
 *   ctx.logger.info(payload);
 *   emit("another.event", { ... });
 * };
 *
 * @template Schema - The TypeBox schema for the event data
 * @template Context - The context type (extends AukContext)
 * @template EventSchemas - All available event schemas for type-safe emit
 */
export type ProducerHandler<
  Schema extends TSchema,
  Context extends AukContext = AukContext,
  EventSchemas extends Record<string, TSchema> = {}
> =
  | ((
      args: {
        payload: Static<Schema>;
        ctx: Context;
        emit: TypedEmitFn<EventSchemas>;
      }
    ) => void | Promise<void>)
  | ((args: { payload: Static<Schema> }) => void | Promise<void>);

/**
 * Required producer handler function used internally by Auk.
 * The `ctx` and `emit` parameters are optional. If included in the handler's
 * signature, they are guaranteed to be provided by Auk.
 * @template Schema - The TypeBox schema for the event data
 * @template Context - The context type (extends AukContext)
 * @template EventSchemas - All available event schemas for type-safe emit
 */
export type RequiredProducerHandler<
  Schema extends TSchema,
  Context extends AukContext = AukContext,
  EventSchemas extends Record<string, TSchema> = {}
> =
  | ((
      args: {
        payload: Static<Schema>;
        ctx: Context;
        emit: TypedEmitFn<EventSchemas>;
      }
    ) => void | Promise<void>)
  | ((args: { payload: Static<Schema> }) => void | Promise<void>);

/**
 * Producer function signature.
 * Producers are event generators that emit events into the system.
 * @template EventName - The event name
 * @template EventSchemas - All available event schemas
 * @template Context - The context type
 */
export type ProducerFn<
  EventName extends keyof EventSchemas,
  EventSchemas extends Record<string, TSchema>,
  Context extends AukContext = AukContext
> = <E extends EventName>(
  event: E,
  opts: {
    handler: ProducerHandler<EventSchemas[E], Context, EventSchemas>;
  }
) => void | Promise<void>;

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
