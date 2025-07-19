# NATS JetStream DLQ Support

This module provides Dead Letter Queue (DLQ) support for the Auk NATS broker using NATS JetStream with **automatic background handling** for the best developer experience.

## Features

- **🔄 Automatic DLQ**: Failed messages are automatically sent to DLQ after maximum retry attempts
- **⚙️ Configurable Retry**: Set the maximum number of delivery attempts before sending to DLQ
- **📊 Message Metadata**: DLQ messages include original event data, error information, and retry count
- **🎯 Automatic Background Handling**: DLQ subscriptions are automatically set up when you subscribe to events
- **🔧 Custom DLQ Handlers**: Optionally register custom handlers for failed messages
- **📈 DLQ Management**: Retrieve and inspect DLQ messages for monitoring and debugging
- **🔄 Backward Compatibility**: Works with existing NATS broker interface

## Configuration

Enable DLQ by configuring the `dlq` option when creating a NATS broker:

```typescript
import { NATS, type DLQConfig } from "./index.js";

const dlqConfig: DLQConfig = {
  enabled: true,
  maxDeliver: 3, // Retry up to 3 times before sending to DLQ
  streamSuffix: ".DLQ", // DLQ streams will be named like "event.DLQ"
  consumerName: "auk-dlq-consumer",
  autoCreateStreams: true,
};

const nats = new NATS({
  servers: "nats://localhost:4222",
  dlq: dlqConfig,
});
```

### DLQ Configuration Options

- `enabled`: Enable/disable DLQ functionality (default: false)
- `maxDeliver`: Maximum number of delivery attempts before sending to DLQ (default: 3)
- `streamSuffix`: Suffix for DLQ stream names (default: ".DLQ")
- `consumerName`: Name for DLQ consumer (default: "auk-dlq-consumer")
- `autoCreateStreams`: Automatically create JetStream streams (default: true)

## Usage

### 🎯 Automatic DLQ (Recommended)

With the enhanced Auk core, DLQ is automatically handled in the background:

```typescript
import { Auk } from "auk/core";
import { NATS } from "auk/addons/nats";

// Create Auk instance with NATS broker
const auk = new Auk({
  mode: "distributed",
  broker: new NATS({
    servers: "nats://localhost:4222",
    dlq: { enabled: true, maxDeliver: 3 },
  }),
});

// Subscribe to events - DLQ is automatically handled!
auk.eventBus.on(
  "orders",
  async (data) => {
    // If this throws an error, message will be retried automatically
    // After maxDeliver attempts, it will be sent to DLQ automatically
    await processOrder(data);
  },
  { delivery: "queue" }
);

// Optionally, register a custom DLQ handler
await auk.eventBus.onDLQ("orders", (metadata) => {
  console.log("Failed message:", metadata);
  // Handle failed messages manually
});
```

### 🔧 Manual DLQ Management

For direct broker usage:

```typescript
// Subscribe to events (DLQ is automatically handled)
nats.subscribe(
  "orders",
  async (data) => {
    // If this throws an error, the message will be retried
    // After maxDeliver attempts, it will be sent to DLQ
    await processOrder(data);
  },
  { delivery: "queue" }
);

// Subscribe to DLQ messages
await nats.subscribeToDLQ("orders", (metadata) => {
  console.log("Failed message:", metadata);
  // Handle failed messages manually
});
```

### DLQ Message Structure

DLQ messages contain the following metadata:

```typescript
interface MessageMetadata {
  originalEvent: string; // Original event name
  originalData: any; // Original message data
  attemptCount: number; // Number of delivery attempts
  timestamp: number; // When the message was sent to DLQ
  error?: string; // Error message that caused the failure
}
```

### DLQ Management

```typescript
// Get DLQ messages for an event
const dlqMessages = await nats.getDLQMessages("orders", 100);

// Check if DLQ is enabled
if (nats.isDLQEnabled()) {
  console.log("DLQ is enabled");
}

// Get DLQ configuration
const config = nats.getDLQConfig();
console.log("Max deliveries:", config.maxDeliver);
```

### 🚀 Enhanced AukBus Methods

The AukBus now provides additional methods for DLQ management:

```typescript
// Register a custom DLQ handler for an event
await bus.onDLQ("orders", (metadata) => {
  console.log("Custom DLQ handler:", metadata);
  // Implement custom retry logic, alerting, etc.
});

// Get DLQ messages for an event
const dlqMessages = await bus.getDLQMessages("orders", 100);
console.log("DLQ messages:", dlqMessages);
```

## How It Works

1. **Message Publishing**: When DLQ is enabled, messages are published to JetStream streams for persistence
2. **Message Processing**: Messages are consumed with explicit acknowledgment
3. **Error Handling**: If a message handler throws an error, the message is negatively acknowledged (NAK) for retry
4. **DLQ Routing**: After the maximum number of delivery attempts, failed messages are sent to a dedicated DLQ stream
5. **🎯 Automatic DLQ Processing**: When you subscribe to an event, DLQ handling is automatically set up in the background
6. **Custom DLQ Handlers**: You can optionally register custom handlers for failed messages
7. **Default DLQ Handler**: If no custom handler is provided, failed messages are logged with full metadata

## JetStream Requirements

To use DLQ functionality, you need:

1. **NATS Server with JetStream**: Ensure your NATS server has JetStream enabled
2. **Stream Creation**: Streams are automatically created if `autoCreateStreams` is true (default)
3. **Proper Permissions**: Ensure your NATS connection has permissions to create streams and consumers
