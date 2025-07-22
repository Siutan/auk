// Re-export TypeBox for convenience
export { type Static, type TSchema, Type } from "@sinclair/typebox";
// Re-export main classes
export {
  Auk,
  type EventSchemasOf, type Module,
  type ModuleFn, type Plugin,
  type PluginFn
} from "./auk.js";

// Re-export all types and interfaces
export * from "./broker.js";
// export * from "./middleware.js";
export * from "./config.js";
export { AukBus } from "./event-bus.js";
export type { AukEvents, EventPayload } from "./events.js";
// Re-export events
export * from "./events.js";
export * from "./lifecycle.js";
// Re-export middleware utilities
export * from "./middleware/index.js";
export * from "./producers.js";
export * from "./types.js";

