# Full type inference between plugins and modules

This should hopefully be a lot better dx than the current implementation, im biased off Elysia. This is where most of the inspiration for this came from.

## Potential type improvements

Key Features

1. Type Registration: Plugins declare their event types with optional runtime validators
2. Wildcard Type Discovery: Modules can discover what types match their wildcard patterns
3. Runtime Validation: Optional validation ensures emitted data matches declared types
4. Type Safety: TypeScript knows the data types for specific events
   How It Works with Wildcards

   ```typescript
   // Plugin declares types
    events: {
    'user.created': { type: 'UserCreatedData' },
    'user.updated': { type: 'UserUpdatedData' },
    'user.deleted': { type: 'UserDeletedData' }
    }

    // Module listens with wildcard
    bus.onTyped('user.*', (data, eventName) => {
    const eventType = bus.getEventType(eventName); // Gets specific type
    // Handle based on actual event name and type
    });
   ```

Alternative Approaches
Option 1: Type Map Approach

```typescript
// Pre-declare all possible event types
interface EventTypeMap {
  "user.created": UserCreatedData;
  "user.updated": UserUpdatedData;
  "user._": UserCreatedData | UserUpdatedData; // Union type
}
```

Option 2: Generic Wildcard Handler

```typescript
bus.on("user.*", <T>(data: T, eventName: keyof EventTypeMap) => {
  // TypeScript narrows T based on eventName
});
```

I'd recommend the first approach I showed because it:

Maintains runtime type information
Works with dynamic event registration
Provides good developer experience with wildcards
Doesn't require pre-declaring all possible event combinations

This fits perfectly with your goal of maintaining clean separation while adding type safety!

## Proposed Code:

```typescript
// Updated types for typed events
export interface TypedAukEvent<T = unknown> {
  event: string;
  data: T;
  // Optional: include the type info for runtime validation
  _type?: string;
}

// Event registry to store type information
type EventRegistry = Map<
  string,
  {
    type: string;
    validator?: (data: unknown) => boolean;
  }
>;

// Plugin registration with type
export interface TypedPlugin<T = unknown> {
  name: string;
  fn: PluginFn;
  events?: {
    [eventName: string]: {
      type: string;
      validator?: (data: unknown) => data is T;
    };
  };
}

// Enhanced AukBus with type registry
export class TypedAukBus {
  private emitter: NodeEventEmitter;
  private eventRegistry: EventRegistry = new Map();
  private wildcardListeners: Map<
    string,
    Set<(data: unknown, eventName: string) => void>
  > = new Map();

  constructor(emitter?: NodeEventEmitter) {
    this.emitter = emitter || new NodeEventEmitter();
  }

  // Register event types from plugins
  registerEventTypes(
    events: Record<
      string,
      { type: string; validator?: (data: unknown) => boolean }
    >
  ) {
    for (const [eventName, config] of Object.entries(events)) {
      this.eventRegistry.set(eventName, config);
    }
  }

  // Emit with type information
  emit<T>(eventObj: TypedAukEvent<T>): boolean {
    // Validate against registered type if available
    const registration = this.eventRegistry.get(eventObj.event);
    if (
      registration &&
      registration.validator &&
      !registration.validator(eventObj.data)
    ) {
      throw new Error(
        `Event '${eventObj.event}' data does not match registered type '${registration.type}'`
      );
    }

    // Emit to exact listeners
    const hasExactListeners = this.emitter.emit(eventObj.event, eventObj.data);

    // Emit to wildcard listeners
    let hasWildcardListeners = false;
    for (const [pattern, listeners] of this.wildcardListeners) {
      if (this.matchesPattern(eventObj.event, pattern)) {
        listeners.forEach((listener) =>
          listener(eventObj.data, eventObj.event)
        );
        hasWildcardListeners = true;
      }
    }

    return hasExactListeners || hasWildcardListeners;
  }

  // Regular event listener
  on<T>(event: string, listener: (data: T) => void): this {
    if (event.includes("*")) {
      // Wildcard listener - gets both data and event name
      if (!this.wildcardListeners.has(event)) {
        this.wildcardListeners.set(event, new Set());
      }
      this.wildcardListeners.get(event)!.add(listener as any);
    } else {
      this.emitter.on(event, listener);
    }
    return this;
  }

  // Typed event listener that knows the event type
  onTyped<T>(
    event: string,
    listener: (data: T, eventName: string) => void
  ): this {
    if (event.includes("*")) {
      // For wildcards, we need to pass the actual event name
      if (!this.wildcardListeners.has(event)) {
        this.wildcardListeners.set(event, new Set());
      }
      this.wildcardListeners.get(event)!.add(listener);
    } else {
      // For exact matches, we can just pass the data
      this.emitter.on(event, (data) => listener(data, event));
    }
    return this;
  }

  // Get type information for an event
  getEventType(eventName: string): string | undefined {
    return this.eventRegistry.get(eventName)?.type;
  }

  // Get all registered types that match a pattern
  getMatchingTypes(pattern: string): Array<{ event: string; type: string }> {
    const results: Array<{ event: string; type: string }> = [];

    for (const [eventName, config] of this.eventRegistry) {
      if (this.matchesPattern(eventName, pattern)) {
        results.push({ event: eventName, type: config.type });
      }
    }

    return results;
  }

  private matchesPattern(eventName: string, pattern: string): boolean {
    if (!pattern.includes("*")) {
      return eventName === pattern;
    }

    // Convert glob pattern to regex
    const regexPattern = pattern
      .replace(/\./g, "\\.")
      .replace(/\*/g, "[^.]*") // * matches anything except dots
      .replace(/\*\*/g, ".*"); // ** matches anything including dots

    return new RegExp(`^${regexPattern}$`).test(eventName);
  }
}

// Example usage:
interface UserCreatedData {
  id: number;
  email: string;
  name: string;
}

interface UserUpdatedData {
  id: number;
  changes: Record<string, unknown>;
}

// Plugin registration with types
const userPlugin: TypedPlugin = {
  name: "userPlugin",
  fn: async (context, bus) => {
    // Plugin emits typed events
    bus.emit({
      event: "user.created",
      data: { id: 1, email: "test@example.com", name: "John" },
    });

    bus.emit({
      event: "user.updated",
      data: { id: 1, changes: { name: "Jane" } },
    });
  },
  events: {
    "user.created": {
      type: "UserCreatedData",
      validator: (data): data is UserCreatedData => {
        return (
          typeof data === "object" &&
          data !== null &&
          "id" in data &&
          "email" in data &&
          "name" in data
        );
      },
    },
    "user.updated": {
      type: "UserUpdatedData",
      validator: (data): data is UserUpdatedData => {
        return (
          typeof data === "object" &&
          data !== null &&
          "id" in data &&
          "changes" in data
        );
      },
    },
  },
};

// Module that listens with type information
const userModule = (bus: TypedAukBus, context: any) => {
  // Listen to specific typed events
  bus.onTyped<UserCreatedData>("user.created", (data, eventName) => {
    console.log(`User created: ${data.name} (${data.email})`);
    // TypeScript knows data is UserCreatedData
  });

  // Listen to wildcard with type discovery
  bus.onTyped("user.*", (data, eventName) => {
    // Get the type information for this specific event
    const eventType = bus.getEventType(eventName);
    console.log(`Received ${eventName} of type ${eventType}:`, data);

    // You could switch based on event name for specific handling
    switch (eventName) {
      case "user.created":
        const userData = data as UserCreatedData;
        console.log(`New user: ${userData.name}`);
        break;
      case "user.updated":
        const updateData = data as UserUpdatedData;
        console.log(`User ${updateData.id} updated:`, updateData.changes);
        break;
    }
  });

  // Or get all matching types for a pattern
  const matchingTypes = bus.getMatchingTypes("user.*");
  console.log("Available user event types:", matchingTypes);
  // Output: [{ event: 'user.created', type: 'UserCreatedData' }, { event: 'user.updated', type: 'UserUpdatedData' }]
};

// Enhanced Auk class that supports typed plugins
export class TypedAuk extends Auk {
  public typedEventBus: TypedAukBus;

  constructor(options: any) {
    super(options);
    this.typedEventBus = new TypedAukBus();
  }

  // Override plugins method to register event types
  typedPlugins(...plugins: TypedPlugin[]) {
    for (const plugin of plugins) {
      // Register the plugin normally
      super.plugins(plugin);

      // Register event types if provided
      if (plugin.events) {
        this.typedEventBus.registerEventTypes(plugin.events);
      }
    }
    return this;
  }
}
```
