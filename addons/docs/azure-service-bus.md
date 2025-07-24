# Azure Service Bus Provider for Auk

The Azure Service Bus provider allows Auk to use Azure Service Bus as a message broker for event handling. This provider supports two modes of operation: topics (pub/sub) and queues (point-to-point).

## Installation

To use the Azure Service Bus provider, you need to install the required dependencies:

```bash
bun add @azure/service-bus
```

If you want to use the auto-creation feature for topics, subscriptions, or queues, you also need to install:

```bash
bun add @azure/arm-servicebus @azure/identity
```

## Configuration

The Azure Service Bus provider can be configured with the following options:

```typescript
import { umqTrigger } from "auk/addons";

// Topic mode configuration (pub/sub - multiple subscribers can receive the same message)
const azureServiceBusTopicConfig = {
  provider: "azure" as const,
  config: {
    connectionString: "your-connection-string",
    // Set to topic mode for pub/sub messaging (default if not specified)
    mode: "topic" as const,
    topicName: "auk_events", // Default: "auk_events"
    subscriptionName: "auk_events-subs", // Default: "${topicName}-subs"
    // Auto-creation of topics and subscriptions
    management: {
      subscriptionId: "your-subscription-id",
      resourceGroupName: "your-resource-group",
      // namespace will be extracted from the connection string if not provided
      // namespace: "your-namespace",
      autoCreateResources: true
    }
  },
};

// Queue mode configuration (point-to-point - only one receiver processes each message)
const azureServiceBusQueueConfig = {
  provider: "azure" as const,
  config: {
    connectionString: "your-connection-string",
    // Set to queue mode for point-to-point messaging
    mode: "queue" as const,
    queueName: "auk_events_queue", // Default: "auk_events_queue"
    // Auto-creation of queues
    management: {
      subscriptionId: "your-subscription-id",
      resourceGroupName: "your-resource-group",
      autoCreateResources: true
    }
  },
};
```

### Configuration Options

| Option | Description | Default |
|--------|-------------|--------|
| `connectionString` | Azure Service Bus connection string | Required |
| `mode` | Messaging mode: `"topic"` or `"queue"` | `"topic"` |
| `topicName` | Name of the topic (for topic mode) | `"auk_events"` |
| `subscriptionName` | Name of the subscription (for topic mode) | `"${topicName}-subs"` |
| `queueName` | Name of the queue (for queue mode) | `"auk_events_queue"` |
| `management.subscriptionId` | Azure subscription ID (for auto-creation) | Required for auto-creation |
| `management.resourceGroupName` | Azure resource group name (for auto-creation) | Required for auto-creation |
| `management.namespace` | Service Bus namespace (for auto-creation) | Extracted from connection string |
| `management.autoCreateResources` | Whether to auto-create resources | `false` |

## Usage

### Topic Mode (Pub/Sub)

In topic mode, multiple subscribers can receive the same message. This is useful for broadcasting events to multiple consumers.

```typescript
import { Auk, T } from "auk";
import { umqTrigger } from "auk/addons";

const auk = new Auk({
  "user.updated": T.Object({
    id: T.String(),
    name: T.String(),
  }),
});

// Producer
auk
  .producer("user.updated")
  .from(umqTrigger(auk, azureServiceBusTopicConfig))
  .handle(async ({ payload, ctx, emit }) => {
    ctx.logger.info("Producing user.updated event via Azure Service Bus Topic", payload);
    emit("user.updated", payload);
  });

// Consumer
auk.consumer("user.updated", (user, ctx) => {
  ctx.logger.info(`User ${user.id} updated: ${user.name}`);
});

auk.start();
```

### Queue Mode (Point-to-Point)

In queue mode, only one consumer will receive each message. This is useful for work distribution among multiple instances.

```typescript
import { Auk, T } from "auk";
import { umqTrigger } from "auk/addons";

const auk = new Auk({
  "user.created": T.Object({
    id: T.String(),
    name: T.String(),
    email: T.String(),
  }),
});

// Producer
auk
  .producer("user.created")
  .from(umqTrigger(auk, azureServiceBusQueueConfig))
  .handle(async ({ payload, ctx, emit }) => {
    ctx.logger.info("Producing user.created event via Azure Service Bus Queue", payload);
    // In queue mode, only one consumer will receive this message
    emit("user.created", payload);
  });

// Consumer
auk.consumer("user.created", (user, ctx) => {
  ctx.logger.info(`User ${user.id} created: ${user.name} (${user.email})`);
});

auk.start();
```

## Auto-Creation of Resources

The Azure Service Bus provider can automatically create topics, subscriptions, and queues if they don't exist. This requires additional permissions and dependencies.

### Prerequisites for Auto-Creation

1. Install the required packages:
   ```bash
   bun add @azure/arm-servicebus @azure/identity
   ```

2. Ensure your Azure credentials have the necessary permissions to create Service Bus resources.

3. Set up the management configuration in your Azure Service Bus config:
   ```typescript
   management: {
     subscriptionId: "your-subscription-id",
     resourceGroupName: "your-resource-group",
     // namespace will be extracted from the connection string if not provided
     // namespace: "your-namespace",
     autoCreateResources: true
   }
   ```

## Choosing Between Topic and Queue Modes

- **Topic Mode**: Use when you need multiple consumers to process the same message (pub/sub pattern).
  - Example: Broadcasting notifications, updates, or events that multiple services need to react to.

- **Queue Mode**: Use when you need to distribute work among multiple instances, with each message processed by only one consumer (point-to-point pattern).
  - Example: Task processing, job queues, or workload distribution.

## Error Handling

The Azure Service Bus provider includes comprehensive error handling and helpful error messages for common issues:

- Missing topics, subscriptions, or queues
- Connection string issues
- Management credential problems
- Message parsing errors

When an error occurs, detailed error messages will be logged to help diagnose and resolve the issue.