import { Auk, Type } from "../src";

// Define strict event schemas
const UserCreatedSchema = Type.Object({
  id: Type.String(),
  name: Type.String(),
  email: Type.String(),
});

const ProductSchema = Type.Object({
  productId: Type.Number(),
  title: Type.String(),
  price: Type.Number(),
});

const app = new Auk()
  .event("user.created", UserCreatedSchema)
  .event("product.updated", ProductSchema);

app.plugins({
  name: "demo-plugin",
  fn: async (_context, bus) => {
    // ✅ This works - correct types
    bus.emitSync({
      event: "user.created",
      data: {
        id: "user123",
        name: "John Doe",
        email: "john@example.com",
      },
    });

    // ❌ This would cause TypeScript error - wrong data type
    // bus.emitSync({
    //   event: "user.created",
    //   data: {
    //     id: 123, // Should be string, not number
    //     name: "John Doe",
    //     email: "john@example.com",
    //   },
    // });

    // ❌ This would cause TypeScript error - missing required field
    // bus.emitSync({
    //   event: "user.created",
    //   data: {
    //     id: "user123",
    //     name: "John Doe",
    //     // email is missing!
    //   },
    // });

    // ✅ This works - correct types for product
    bus.emitSync({
      event: "product.updated",
      data: {
        productId: 42,
        title: "Awesome Product",
        price: 29.99,
      },
    });
  },
});

app.modules({
  name: "demo-module",
  fn: (bus, context) => {
    // ✅ userData is correctly typed as { id: string; name: string; email: string; }
    bus.on("user.created", (userData) => {
      context.logger.info(`User created: ${userData.name}`);
      // TypeScript knows these properties exist and their types
      console.log(`ID: ${userData.id}, Email: ${userData.email}`);
    });

    // ✅ productData is correctly typed as { productId: number; title: string; price: number; }
    bus.on("product.updated", (productData) => {
      context.logger.info(
        `Product ${productData.productId} updated: ${productData.title}`
      );
      // TypeScript knows price is a number, so we can call toFixed
      console.log(`Price: $${productData.price.toFixed(2)}`);
    });

    // ✅ For untyped events, data is 'any'
    bus.on("unknown.event", (data) => {
      // data is any - no type safety but maximum flexibility
      context.logger.info("Unknown event:", data);
    });
  },
});

app.start().then(() => {
  console.log("Type checking demo started!");
});
