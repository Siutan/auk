# Sentry Middleware

Auk Addons provides Sentry middleware to capture and report errors in your Auk event pipeline.

**note**: This doesn't work as it was built for an older version of Auk.
I will get around to updating it soon.

## Configuration Options

```ts
import { sentryMiddleware } from "@aukjs/addons";

auk.middleware(sentryMiddleware({
  dsn: "<your-sentry-dsn>",
  environment: "production"
}));
```

- `dsn`: Your Sentry DSN
- `environment`: (optional) Environment name

## Mini Usage Example

```ts
import { Auk, T } from "@aukjs/core";
import { sentryMiddleware } from "@aukjs/addons";

const Events = { "error.test": T.Object({ msg: T.String() }) };
const auk = new Auk(Events);
auk.middleware(sentryMiddleware({ dsn: "<your-sentry-dsn>", ... }));

auk.producer("error.test")
  .from(cron("* * * * * *"))
  .handle(async (ctx) => {
    throw new Error("This will be reported to Sentry");
  });
```