import { Auk, Type, ProducerHandler, AukContext, Static } from "../src";


const Events = {
  "user.creation": Type.Object({ id: Type.String(), email: Type.String() }),
  "user.creation.completed": Type.Object({
    id: Type.String(),
    email: Type.String(),
    at: Type.String(),
  }),
  "user.creation.failed": Type.Object({
    id: Type.String(),
    email: Type.String(),
    error: Type.String(),
  }),
}

// Create Auk instance with events
const auk = new Auk(Events, { config: { env: "development" } });

// Register a producer
