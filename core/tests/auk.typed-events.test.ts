/** biome-ignore-all lint/suspicious/noExplicitAny: <ignoring for test purposes> */

import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { Auk, Type } from "../src/index";

describe("Auk Typed Events", () => {
  let auk: Auk;

  beforeEach(() => {
    auk = new Auk({
      config: { env: "test", serviceName: "typed-events-test" },
    });
  });

  afterEach(async () => {
    if (auk) {
      await auk.stop();
    }
  });

  it("registers event schemas and provides type safety", () => {
    const UserSchema = Type.Object({
      id: Type.String(),
      name: Type.String(),
      email: Type.String(),
    });

    const OrderSchema = Type.Object({
      id: Type.String(),
      userId: Type.String(),
      amount: Type.Number(),
    });

    const typedAuk = auk
      .event("user.created", UserSchema)
      .event("order.processed", OrderSchema);

    // TypeScript should enforce these types
    expect(typedAuk).toBeDefined();
  });

  it("allows emitting typed events", async () => {
    const UserSchema = Type.Object({
      id: Type.String(),
      name: Type.String(),
      email: Type.String(),
    });

    const typedAuk = auk.event("user.created", UserSchema);

    const testPlugin = {
      name: "test-plugin",
      fn: async (_context: any, bus: any) => {
        // This should be type-safe
        await bus.emit({
          event: "user.created",
          data: {
            id: "user123",
            name: "John Doe",
            email: "john@example.com",
          },
        });
      },
    };

    const testModule = {
      name: "test-module",
      fn: (bus: any, _context: any) => {
        bus.on("user.created", (userData: any) => {
          expect(userData.id).toBe("user123");
          expect(userData.name).toBe("John Doe");
          expect(userData.email).toBe("john@example.com");
        });
      },
    };

    typedAuk.plugins(testPlugin).modules(testModule);
    typedAuk.start();

    await new Promise((r) => setTimeout(r, 50));
  });

  it("supports multiple typed events", async () => {
    const UserSchema = Type.Object({
      id: Type.String(),
      name: Type.String(),
    });

    const OrderSchema = Type.Object({
      id: Type.String(),
      userId: Type.String(),
      amount: Type.Number(),
    });

    const typedAuk = auk
      .event("user.created", UserSchema)
      .event("order.processed", OrderSchema);

    const testPlugin = {
      name: "test-plugin",
      fn: async (_context: any, bus: any) => {
        await bus.emit({
          event: "user.created",
          data: {
            id: "user123",
            name: "John Doe",
          },
        });

        await bus.emit({
          event: "order.processed",
          data: {
            id: "order456",
            userId: "user123",
            amount: 99.99,
          },
        });
      },
    };

    const receivedEvents: any[] = [];

    const testModule = {
      name: "test-module",
      fn: (bus: any, _context: any) => {
        bus.on("user.created", (userData: any) => {
          receivedEvents.push({ type: "user", data: userData });
        });

        bus.on("order.processed", (orderData: any) => {
          receivedEvents.push({ type: "order", data: orderData });
        });
      },
    };

    typedAuk.plugins(testPlugin).modules(testModule);
    typedAuk.start();

    await new Promise((r) => setTimeout(r, 50));

    expect(receivedEvents).toHaveLength(2);
    expect(receivedEvents[0].type).toBe("user");
    expect(receivedEvents[0].data.id).toBe("user123");
    expect(receivedEvents[1].type).toBe("order");
    expect(receivedEvents[1].data.id).toBe("order456");
  });

  it("supports complex nested schemas", async () => {
    const AddressSchema = Type.Object({
      street: Type.String(),
      city: Type.String(),
      zipCode: Type.String(),
    });

    const UserSchema = Type.Object({
      id: Type.String(),
      name: Type.String(),
      email: Type.String(),
      address: AddressSchema,
      tags: Type.Array(Type.String()),
    });

    const typedAuk = auk.event("user.created", UserSchema);

    const testPlugin = {
      name: "test-plugin",
      fn: async (_context: any, bus: any) => {
        await bus.emit({
          event: "user.created",
          data: {
            id: "user123",
            name: "John Doe",
            email: "john@example.com",
            address: {
              street: "123 Main St",
              city: "Anytown",
              zipCode: "12345",
            },
            tags: ["premium", "verified"],
          },
        });
      },
    };

    const testModule = {
      name: "test-module",
      fn: (bus: any, _context: any) => {
        bus.on("user.created", (userData: any) => {
          expect(userData.id).toBe("user123");
          expect(userData.address.street).toBe("123 Main St");
          expect(userData.address.city).toBe("Anytown");
          expect(userData.tags).toContain("premium");
          expect(userData.tags).toContain("verified");
        });
      },
    };

    typedAuk.plugins(testPlugin).modules(testModule);
    typedAuk.start();

    await new Promise((r) => setTimeout(r, 50));
  });

  it("supports optional fields in schemas", async () => {
    const UserSchema = Type.Object({
      id: Type.String(),
      name: Type.String(),
      email: Type.Optional(Type.String()),
      phone: Type.Optional(Type.String()),
    });

    const typedAuk = auk.event("user.created", UserSchema);

    const testPlugin = {
      name: "test-plugin",
      fn: async (_context: any, bus: any) => {
        await bus.emit({
          event: "user.created",
          data: {
            id: "user123",
            name: "John Doe",
            email: "john@example.com",
            // phone is optional, so we can omit it
          },
        });
      },
    };

    const testModule = {
      name: "test-module",
      fn: (bus: any, _context: any) => {
        bus.on("user.created", (userData: any) => {
          expect(userData.id).toBe("user123");
          expect(userData.name).toBe("John Doe");
          expect(userData.email).toBe("john@example.com");
          expect(userData.phone).toBeUndefined();
        });
      },
    };

    typedAuk.plugins(testPlugin).modules(testModule);
    typedAuk.start();

    await new Promise((r) => setTimeout(r, 50));
  });

  it("supports union types in schemas", async () => {
    const StatusSchema = Type.Union([
      Type.Literal("pending"),
      Type.Literal("processing"),
      Type.Literal("completed"),
      Type.Literal("failed"),
    ]);

    const OrderSchema = Type.Object({
      id: Type.String(),
      status: StatusSchema,
      amount: Type.Number(),
    });

    const typedAuk = auk.event("order.updated", OrderSchema);

    const testPlugin = {
      name: "test-plugin",
      fn: async (_context: any, bus: any) => {
        await bus.emit({
          event: "order.updated",
          data: {
            id: "order123",
            status: "processing",
            amount: 99.99,
          },
        });
      },
    };

    const testModule = {
      name: "test-module",
      fn: (bus: any, _context: any) => {
        bus.on("order.updated", (orderData: any) => {
          expect(orderData.id).toBe("order123");
          expect(orderData.status).toBe("processing");
          expect(orderData.amount).toBe(99.99);
        });
      },
    };

    typedAuk.plugins(testPlugin).modules(testModule);
    typedAuk.start();

    await new Promise((r) => setTimeout(r, 50));
  });

  it("supports array types in schemas", async () => {
    const ItemSchema = Type.Object({
      id: Type.String(),
      name: Type.String(),
      price: Type.Number(),
    });

    const OrderSchema = Type.Object({
      id: Type.String(),
      items: Type.Array(ItemSchema),
      total: Type.Number(),
    });

    const typedAuk = auk.event("order.created", OrderSchema);

    const testPlugin = {
      name: "test-plugin",
      fn: async (_context: any, bus: any) => {
        await bus.emit({
          event: "order.created",
          data: {
            id: "order123",
            items: [
              { id: "item1", name: "Product 1", price: 29.99 },
              { id: "item2", name: "Product 2", price: 19.99 },
            ],
            total: 49.98,
          },
        });
      },
    };

    const testModule = {
      name: "test-module",
      fn: (bus: any, _context: any) => {
        bus.on("order.created", (orderData: any) => {
          expect(orderData.id).toBe("order123");
          expect(orderData.items).toHaveLength(2);
          expect(orderData.items[0].name).toBe("Product 1");
          expect(orderData.items[1].name).toBe("Product 2");
          expect(orderData.total).toBe(49.98);
        });
      },
    };

    typedAuk.plugins(testPlugin).modules(testModule);
    typedAuk.start();

    await new Promise((r) => setTimeout(r, 50));
  });

  it("allows untyped events alongside typed events", async () => {
    const UserSchema = Type.Object({
      id: Type.String(),
      name: Type.String(),
    });

    const typedAuk = auk.event("user.created", UserSchema);

    const testPlugin = {
      name: "test-plugin",
      fn: async (_context: any, bus: any) => {
        // Typed event
        await bus.emit({
          event: "user.created",
          data: {
            id: "user123",
            name: "John Doe",
          },
        });

        // Untyped event
        await bus.emit({
          event: "system.log",
          data: {
            level: "info",
            message: "User created",
            timestamp: Date.now(),
          },
        });
      },
    };

    const receivedEvents: any[] = [];

    const testModule = {
      name: "test-module",
      fn: (bus: any, _context: any) => {
        bus.on("user.created", (userData: any) => {
          receivedEvents.push({ type: "user", data: userData });
        });

        bus.on("system.log", (logData: any) => {
          receivedEvents.push({ type: "log", data: logData });
        });
      },
    };

    typedAuk.plugins(testPlugin).modules(testModule);
    typedAuk.start();

    await new Promise((r) => setTimeout(r, 50));

    expect(receivedEvents).toHaveLength(2);
    expect(receivedEvents[0].type).toBe("user");
    expect(receivedEvents[0].data.id).toBe("user123");
    expect(receivedEvents[1].type).toBe("log");
    expect(receivedEvents[1].data.level).toBe("info");
  });

  it("supports chaining event registrations", () => {
    const UserSchema = Type.Object({
      id: Type.String(),
      name: Type.String(),
    });

    const OrderSchema = Type.Object({
      id: Type.String(),
      userId: Type.String(),
    });

    const ProductSchema = Type.Object({
      id: Type.String(),
      name: Type.String(),
      price: Type.Number(),
    });

    const typedAuk = auk
      .event("user.created", UserSchema)
      .event("order.created", OrderSchema)
      .event("product.created", ProductSchema);

    expect(typedAuk).toBeDefined();
  });
});
