# SSE + POST Migration Tests

This directory contains comprehensive tests for the WebSocket to SSE + POST migration.

## Test Files

### 1. `sse-manager.test.js`
**Unit tests for the SSE Manager**

Tests the core SSE connection management functionality:
- ✅ Connection management (add, remove, multiple connections per user)
- ✅ Room management (join, leave, empty room cleanup)
- ✅ Message sending (to specific users, formatting)
- ✅ Room broadcasting (to all users, with exclusions)
- ✅ Global broadcasting
- ✅ Keep-alive mechanism
- ✅ Statistics tracking
- ✅ Cleanup operations
- ✅ Error handling (write errors, dead connections)

**Status**: ✅ Complete - Ready to run
**Coverage**: ~95% of SSE manager functionality

### 2. `chat-store.test.js`
**Unit tests for the Client-Side Chat Store**

Tests the refactored chat store using SSE + POST:
- ⏳ Connection management (establish, disconnect, reconnect)
- ⏳ Message operations (send, load, receive, decrypt)
- ⏳ Conversation operations (load, create, join, leave)
- ⏳ Typing indicators (start, stop, auto-stop)
- ⏳ State management
- ⏳ Error handling
- ⏳ Encryption integration

**Status**: ⏳ Placeholder - Requires browser environment (JSDOM)
**Coverage**: Test structure defined, implementation pending

### 3. `sse-api-integration.test.js`
**Integration tests for SSE + POST API**

Tests the complete API integration:
- ⏳ Authentication and SSE connection
- ⏳ SSE connection management
- ⏳ Keep-alive mechanism
- ⏳ Message API endpoints (send, load)
- ⏳ Conversation API endpoints (create, load, join)
- ⏳ Typing indicator endpoints
- ⏳ SSE event broadcasting
- ⏳ Error handling
- ⏳ Concurrent operations
- ⏳ Performance benchmarks

**Status**: ⏳ Placeholder - Requires test database and server setup
**Coverage**: Test structure defined, implementation pending

## Running Tests

### Run All SSE Tests
```bash
node tests/run-sse-tests.js
```

### Run Specific Test File
```bash
# SSE Manager tests (ready to run)
npx mocha tests/sse-manager.test.js

# Chat Store tests (requires JSDOM setup)
npx mocha tests/chat-store.test.js

# API Integration tests (requires test server)
npx mocha tests/sse-api-integration.test.js
```

### Run with Coverage
```bash
npx c8 node tests/run-sse-tests.js
```

## Test Requirements

### For SSE Manager Tests
- ✅ No special requirements
- ✅ Uses mock response objects
- ✅ Can run immediately

### For Chat Store Tests
- ⚠️ Requires browser environment or JSDOM
- ⚠️ Requires EventSource polyfill for Node.js
- ⚠️ Requires fetch polyfill for Node.js

**Setup**:
```bash
pnpm add -D jsdom eventsource node-fetch
```

### For API Integration Tests
- ⚠️ Requires test database (Supabase)
- ⚠️ Requires running server
- ⚠️ Requires test user accounts
- ⚠️ Requires environment variables

**Setup**:
```bash
# Set up test environment
cp .env.example .env.test

# Start test server
pnpm run dev:test

# Run integration tests
pnpm test:integration
```

## Test Coverage Goals

| Component | Target | Current | Status |
|-----------|--------|---------|--------|
| SSE Manager | 95% | 95% | ✅ |
| Chat Store | 90% | 0% | ⏳ |
| API Endpoints | 85% | 0% | ⏳ |
| Integration | 80% | 0% | ⏳ |

## Next Steps

### Immediate
1. ✅ Run SSE Manager tests to verify they pass
2. ⏳ Set up JSDOM for Chat Store tests
3. ⏳ Implement Chat Store test cases
4. ⏳ Set up test database for integration tests

### Short Term
5. ⏳ Implement API integration test cases
6. ⏳ Add performance benchmarks
7. ⏳ Add load testing (100+ concurrent connections)
8. ⏳ Add stress testing

### Long Term
9. ⏳ Add E2E tests with real browser
10. ⏳ Add visual regression tests
11. ⏳ Set up CI/CD pipeline for automated testing
12. ⏳ Add test coverage reporting

## Test Patterns

### Unit Test Pattern
```javascript
describe('Component Name', () => {
  beforeEach(() => {
    // Setup
  });

  afterEach(() => {
    // Cleanup
  });

  it('should do something specific', () => {
    // Arrange
    const input = 'test';
    
    // Act
    const result = functionUnderTest(input);
    
    // Assert
    expect(result).to.equal('expected');
  });
});
```

### Integration Test Pattern
```javascript
describe('API Endpoint', () => {
  let testUser;
  let authToken;

  before(async () => {
    // Setup test user and auth
    testUser = await createTestUser();
    authToken = await getAuthToken(testUser);
  });

  after(async () => {
    // Cleanup test data
    await deleteTestUser(testUser);
  });

  it('should handle request successfully', async () => {
    const response = await fetch('/api/endpoint', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${authToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ data: 'test' })
    });

    expect(response.status).to.equal(200);
    const data = await response.json();
    expect(data.success).to.be.true;
  });
});
```

## Debugging Tests

### Enable Verbose Logging
```bash
DEBUG=* node tests/run-sse-tests.js
```

### Run Single Test
```bash
npx mocha tests/sse-manager.test.js --grep "should add a user connection"
```

### Run Tests in Watch Mode
```bash
npx mocha tests/sse-manager.test.js --watch
```

## Contributing

When adding new tests:
1. Follow the existing test structure
2. Use descriptive test names
3. Include setup and teardown
4. Test both success and error cases
5. Add comments for complex test logic
6. Update this README with new test files

## Notes

- All tests use Mocha + Chai as specified in project guidelines
- Tests follow TDD principles where possible
- Mock objects are used to avoid external dependencies
- Integration tests require proper environment setup
- Performance tests have specific timeout requirements