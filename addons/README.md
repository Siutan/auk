# Auk Addons

Auk Addons is a collection of integrations and utilities that extend the core Auk event bus and background job framework. This package provides out-of-the-box support for popular message brokers, advanced triggers, and middleware to help you build robust, distributed event-driven systems.

## What does it include?

- **Distributed Broker Integrations:**
  - **NATS JetStream**: Distributed messaging with dead letter queue (DLQ) support and lifecycle hooks.
  - **Azure Service Bus**: Managed pub/sub and queue support for Azure cloud environments, including resource management utilities.
  - **RabbitMQ**: Topic-based messaging for scalable event delivery.
  - **Kafka**: (Planned) Integration for high-throughput distributed messaging.

- **Triggers:**
  - **UMQ Trigger**: Unified interface for using Azure Service Bus, RabbitMQ, and (soon) Kafka as event triggers in Auk producers.
  - **Webhook Trigger**: Easily trigger events from incoming webhooks.

- **Middleware:**
  - **Sentry Middleware**: Capture and report errors in your Auk event pipeline to Sentry for monitoring and alerting.

## Why Auk Addons?

Auk Addons was created to make it easy to connect Auk to real-world infrastructure and cloud services, enabling production-ready event-driven architectures with minimal setup. It abstracts the complexity of broker configuration, resource management, and error handling, so you can focus on your application's logic.

## Usage

Import the integrations you need from `@aukjs/addons` and plug them into your Auk setup. For detailed usage and configuration, see the source files in the `src/` directory and the [Azure Service Bus guide](./docs/azure-service-bus.md).