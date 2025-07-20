# Auk Testing Strategy & Fixes

## Issues Fixed

### 1. **Shutdown Mechanism** ✅

**Problem**: Tests were hanging and not exiting properly, requiring Ctrl+C to terminate.

**Root Cause**:

- Tests called `auk.start()` which blocks indefinitely waiting for process signals
- Tests used `process.kill(process.pid, "SIGINT")` which killed the entire test process
- Missing proper `await` on `auk.stop()` calls

**Solution**:

- Added `startNonBlocking()` method for tests that doesn't set up signal handlers
- Fixed all tests to use proper async/await patterns
- Removed `process.kill()` calls and replaced with proper `await auk.stop()`

### 2. **Wildcard Event Routing** ✅

**Problem**: Wildcard patterns (`user.*`, `*.created`, `*`) weren't matching events correctly.

**Root Cause**: Bus instances created for modules/plugins had separate wildcard listener arrays.

**Solution**: Modified `createCopyWithHooks()` to share wildcard listeners reference instead of copying.

### 3. **Plugin Error Handling** ✅

**Problem**: When a plugin failed during startup, it prevented subsequent plugins from loading.

**Root Cause**: Missing error handling around plugin execution.

**Solution**: Added try-catch blocks around plugin execution to handle errors gracefully while continuing to load other plugins.

## Test Quality Improvements

### ✅ **What Good Tests Should Focus On**

The new `auk.comprehensive.test.ts` demonstrates proper testing patterns:

1. **Real Workflows**: Test complete user scenarios (registration, order processing, etc.)
2. **Error Handling**: Test how the system behaves under failure conditions
3. **Performance**: Test high-frequency events and concurrent processing
4. **Type Safety**: Test TypeScript integration and schema validation
5. **Resource Management**: Test cleanup, lifecycle management, and health monitoring

### ❌ **What to Avoid**

- Testing implementation details instead of behavior
- Using `process.kill()` or similar process manipulation in tests
- Calling `auk.start()` in tests (use `startNonBlocking()` instead)
- Not awaiting async operations properly
- Testing individual methods in isolation without context

## Test Patterns

### ✅ **Correct Async Pattern**

```typescript
describe("Feature Tests", () => {
  let auk: Auk;

  beforeEach(() => {
    auk = new Auk({ config: { env: "test" } });
  });

  afterEach(async () => {
    if (auk) {
      await auk.stop(); // Always await!
    }
  });

  it("should handle workflow", async () => {
    // Setup modules and plugins
    auk.modules(/* ... */);
    auk.plugins(/* ... */);

    // Use startNonBlocking for tests
    await auk.startNonBlocking();

    // Wait for async operations
    await new Promise((resolve) => setTimeout(resolve, 50));

    // Assertions
    expect(/* ... */);
  });
});
```

### ❌ **Incorrect Patterns**

```typescript
// DON'T do this:
auk.start(); // Blocks indefinitely
process.kill(process.pid, "SIGINT"); // Kills test process
auk.stop(); // Missing await
```

## Performance & Scalability Testing

The comprehensive tests include:

- **High-frequency events**: 1000 events processed in ~200ms
- **Concurrent processing**: 50 concurrent operations
- **Memory efficiency**: No memory leaks during cleanup
- **Error resilience**: Continued operation despite individual failures

## Type Safety Testing

Tests verify:

- TypeScript type enforcement at compile time
- Runtime schema validation with TypeBox
- Proper typing for wildcard patterns
- Generic type inference for event registries

## Recommendations

### 1. **Use the Comprehensive Test as Template**

The `auk.comprehensive.test.ts` file demonstrates best practices. Use it as a template for new tests.

### 2. **Focus on User Scenarios**

Instead of testing individual methods, test complete workflows that users would actually implement.

### 3. **Test Error Conditions**

Always test how your system behaves when things go wrong:

- Plugin failures
- Middleware errors
- Network issues (for distributed mode)
- Resource exhaustion

### 4. **Performance Benchmarks**

Include performance tests to catch regressions:

- Event throughput
- Memory usage
- Startup time
- Shutdown time

### 5. **Integration Tests**

Test how Auk integrates with:

- Different brokers (NATS, Redis, etc.)
- Database connections
- External APIs
- Monitoring systems

## Test Organization

```
tests/
├── auk.comprehensive.test.ts    # Main functionality tests
├── auk.performance.test.ts      # Performance benchmarks
├── auk.distributed.test.ts      # Distributed mode tests
├── auk.integration.test.ts      # Integration tests
└── auk.edge-cases.test.ts       # Edge cases and error conditions
```

## Running Tests

```bash
# Run all tests
bun test

# Run specific test file
bun test auk.comprehensive.test.ts

# Run with coverage
bun test --coverage

# Run in watch mode
bun test --watch
```

## Key Metrics to Track

- **Test execution time**: Should complete quickly
- **Event throughput**: Should handle thousands of events per second
- **Memory usage**: Should not leak memory during cleanup
- **Error recovery**: Should handle failures gracefully
- **Type safety**: Should catch type errors at compile time
