// Global event map for Auk (augmentable via module augmentation)
export interface AukEvents {}

// Runtime registry for event schemas
import type { TSchema } from "@sinclair/typebox";

export const eventSchemas: Record<string, TSchema> = {};

// Helper to register an event and its schema (for use in feature modules)
export function defineEvent<EventName extends string, Schema extends TSchema>(
  name: EventName,
  schema: Schema
) {
  eventSchemas[name] = schema;
  return name as EventName;
}

// Type helper to get the payload type for an event
import type { Static } from "@sinclair/typebox";
export type EventPayload<E extends keyof AukEvents> =
  AukEvents[E] extends TSchema ? Static<AukEvents[E]> : never;

// Producer helper: infers payload type from global event map, but allows explicit override to avoid deep type recursion
export function createProducer<
  E extends keyof AukEvents,
  Payload = EventPayload<E>,
  Ctx = unknown
>(event: E, fn: (payload: Payload, ctx: Ctx) => Promise<void> | void) {
  return { event, run: fn };
}

// Consumer helper: infers payload type from global event map, but allows explicit override
export function createConsumer<
  E extends keyof AukEvents,
  Payload = EventPayload<E>,
  Ctx = unknown
>(event: E, fn: (payload: Payload, ctx: Ctx) => Promise<void> | void) {
  return { event, handle: fn };
}

// Type-safe webhook handler for { type, data } events
import { Value } from "@sinclair/typebox/value";

export async function aukWebhookHandler(req: { json: () => Promise<any> }) {
  const json = await req.json();
  const { type, data } = json ?? {};

  if (!type || !(type in eventSchemas)) {
    return { status: 400, body: { error: "Unknown event type" } };
  }

  const schema = eventSchemas[type] as import("@sinclair/typebox").TSchema;
  const valid = Value.Check(schema, data);
  if (!valid) {
    return { status: 400, body: { error: "Schema validation failed" } };
  }

  // At this point, data is type-safe for the event
  return { status: 204, body: {} };
}
