# Auk Core

Auk is a modern, type-safe event bus and background job framework for TypeScript projects. It is designed to make event-driven architectures and background processing simple, maintainable and extensible.

## What is Auk?

Auk provides a unified API for defining, emitting, and consuming events with full type safety using [TypeBox](https://github.com/sinclairzx81/typebox) schemas. It supports both local and distributed modes, allowing you to scale from single-instance apps to multi-instance, brokered deployments.

Key features include:
- **Type-safe event schemas** for reliable event contracts
- **Fluent producer and consumer APIs** for easy registration and handling
- **Flexible triggers** (cron, message queue, custom sources) for background jobs
- **Middleware support** for cross-cutting concerns
- **Graceful lifecycle management** and cleanup

## Why?

Auk was created to address the fragmentation, complexity and boilerplate often found in event-driven and background job systems. By leveraging TypeScript's type system and a modular, fluent API, Auk helps you:
- Reduce runtime errors with compile-time event validation
- Write less boilerplate for producers, consumers, and triggers
- Compose and extend event-driven logic with ease

## Documentation

For detailed API reference, usage examples, and advanced patterns, see the [`docs/`](./docs/) folder.