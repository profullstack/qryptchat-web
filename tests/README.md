# Testing Documentation

This document outlines the comprehensive testing strategy for the QryptChat web application, focusing on TDD (Test-Driven Development) principles and covering all UI/API/WebSocket interactions.

## Testing Framework

- **Framework**: Vitest (Jest-compatible API with Vite integration)
- **Assertions**: Vitest built-in assertions (Jest-compatible)
- **Mocking**: Vitest mocking utilities
- **Environment**: jsdom for DOM simulation
- **Coverage**: Built-in coverage reporting

## Test Structure

### Directory Organization

```
tests/
├── setup.js                    # Global test setup and utilities
├── api/                        # API endpoint tests
│   └── auth/                   # Authentication API tests
│       ├── send-sms.test.js    # SMS sending endpoint tests
│       ├── verify-sms.test.js  # SMS verification endpoint tests
│       └── debug-sms.test.js   # SMS debugging endpoint tests
├── stores/                     # Svelte store tests
│   └── auth.test.js           # Authentication store tests
├── utils/                      # Utility function tests
│   └── sms-debug.test.js      # SMS debugging utilities tests
├── integration/                # Integration tests
│   └── auth-flow.test.js      # End-to-end authentication flow tests
└── README.md                  # This documentation
```

## Test Categories

### 1. API Endpoint Tests (`tests/api/`)

Tests for SvelteKit API routes that handle server-side logic.

#### SMS Authentication API Tests

- **`send-sms.test.js`**: Tests for `/api/auth/send-sms`
  - Input validation (phone number format)
  - SMS sending success/failure scenarios
  - Error handling and user-friendly messages
  - Rate limiting and security measures
  - Development vs production behavior

- **`verify-sms.test.js`**: Tests for `/api/auth/verify-sms`
  - OTP verification logic
  - User creation and login flows
  - Username validation and conflicts
  - Database operations
  - Session management

- **`debug-sms.test.js`**: Tests for `/api/auth/debug-sms`
  - Diagnostic operations
  - System health checks
  - SMS testing utilities
  - Error reporting and logging

### 2. Store Tests (`tests/stores/`)

Tests for Svelte stores that manage application state and API interactions.

#### Authentication Store Tests

- **`auth.test.js`**: Tests for authentication state management
  - Store initialization and state management
  - API call orchestration (sendSMS, verifySMS)
  - LocalStorage integration
  - Error state management
  - User session persistence
  - Logout functionality

### 3. Utility Tests (`tests/utils/`)

Tests for utility functions and helper classes.

#### SMS Debugging Utilities

- **`sms-debug.test.js`**: Tests for SMS debugging tools
  - Debug logger functionality
  - Error formatting and suggestions
  - System diagnostics
  - Environment validation
  - Database connectivity checks

### 4. Integration Tests (`tests/integration/`)

End-to-end tests that verify complete user workflows.

#### Authentication Flow Tests

- **`auth-flow.test.js`**: Complete authentication workflows
  - New user registration flow
  - Existing user login flow
  - Error recovery scenarios
  - Session management
  - Concurrent operations
  - Edge cases and error handling

## Testing Patterns

### 1. Test-Driven Development (TDD)

All tests follow TDD principles:

1. **Red**: Write failing tests first
2. **Green**: Implement minimal code to pass tests
3. **Refactor**: Improve code while keeping tests green

### 2. Arrange-Act-Assert (AAA) Pattern

```javascript
describe('Feature', () => {
  it('should behave correctly', async () => {
    // Arrange - Set up test data and mocks
    const mockData = { test: 'data' };
    mockFunction.mockResolvedValue(mockData);
    
    // Act - Execute the functionality
    const result = await functionUnderTest(input);
    
    // Assert - Verify the results
    expect(result).toEqual(expectedOutput);
    expect(mockFunction).toHaveBeenCalledWith(expectedInput);
  });
});
```

### 3. Comprehensive Mocking Strategy

#### API Mocking
- Mock fetch calls using Vitest's global fetch mock
- Provide helper functions for common response patterns
- Test both success and error scenarios

#### Module Mocking
- Mock external dependencies (Supabase, SvelteKit modules)
- Use `vi.mock()` for module-level mocking
- Provide typed mock implementations

#### Environment Mocking
- Mock browser APIs (localStorage, fetch)
- Simulate different environments (development/production)
- Mock SvelteKit-specific functionality

## Test Utilities

### Global Setup (`tests/setup.js`)

Provides common testing utilities:

- **Mock Helpers**:
  - `mockApiSuccess(data)` - Mock successful API responses
  - `mockApiError(error, status)` - Mock API error responses
  - `mockNetworkError()` - Mock network failures

- **Console Management**:
  - `suppressConsole()` - Hide console output during tests
  - `restoreConsole()` - Restore console output

- **Environment Setup**:
  - Global mocks for browser APIs
  - SvelteKit environment mocking
  - Test cleanup utilities

## Running Tests

### Basic Commands

```bash
# Run all tests
pnpm test

# Run tests in watch mode
pnpm test --watch

# Run tests with UI
pnpm test:ui

# Run tests with coverage
pnpm test:coverage
```

### Test Filtering

```bash
# Run specific test file
pnpm test auth.test.js

# Run tests matching pattern
pnpm test --grep "SMS"

# Run tests in specific directory
pnpm test tests/api/
```

## Coverage Requirements

### Target Coverage Metrics

- **Statements**: 90%+
- **Branches**: 85%+
- **Functions**: 90%+
- **Lines**: 90%+

### Coverage Exclusions

- Configuration files
- Test setup files
- Development-only utilities
- External library wrappers

## Best Practices

### 1. Test Isolation

- Each test should be independent
- Use `beforeEach`/`afterEach` for setup/cleanup
- Reset mocks between tests
- Clear state between tests

### 2. Descriptive Test Names

```javascript
// Good
it('should return 400 when phone number is missing')
it('should successfully verify SMS for existing user')

// Bad
it('should work')
it('test verification')
```

### 3. Test Edge Cases

- Invalid inputs
- Network failures
- Race conditions
- Boundary conditions
- Error scenarios

### 4. Mock Strategy

- Mock external dependencies
- Keep mocks simple and focused
- Verify mock interactions
- Reset mocks between tests

### 5. Async Testing

```javascript
// Proper async test handling
it('should handle async operations', async () => {
  const result = await asyncFunction();
  expect(result).toBeDefined();
});

// Handle promises properly
it('should handle promise rejections', async () => {
  await expect(failingFunction()).rejects.toThrow('Expected error');
});
```

## Debugging Tests

### Common Issues

1. **Async/Await Problems**
   - Ensure all async operations are properly awaited
   - Use `async/await` consistently
   - Handle promise rejections

2. **Mock Issues**
   - Verify mocks are properly reset
   - Check mock implementation matches expected interface
   - Ensure mocks are called with correct parameters

3. **State Pollution**
   - Clear localStorage between tests
   - Reset global state
   - Use proper cleanup in `afterEach`

### Debugging Tools

```javascript
// Debug test output
console.log('Debug info:', testData);

// Inspect mock calls
console.log('Mock calls:', mockFunction.mock.calls);

// Check test state
console.log('Current state:', get(store));
```

## Continuous Integration

### GitHub Actions Integration

Tests run automatically on:
- Pull requests
- Push to main branch
- Scheduled runs (daily)

### Quality Gates

- All tests must pass
- Coverage thresholds must be met
- No linting errors
- No TypeScript errors (in JSDoc)

## Future Improvements

### Planned Enhancements

1. **Visual Regression Testing**
   - Screenshot comparison tests
   - Component visual testing

2. **Performance Testing**
   - Load testing for API endpoints
   - Memory leak detection

3. **Accessibility Testing**
   - Automated a11y testing
   - Screen reader compatibility

4. **Cross-browser Testing**
   - Multiple browser support
   - Mobile device testing

### Test Maintenance

- Regular review of test coverage
- Update tests when features change
- Remove obsolete tests
- Optimize slow tests

## Contributing

When adding new features:

1. Write tests first (TDD approach)
2. Ensure tests cover edge cases
3. Update documentation
4. Verify coverage requirements
5. Run full test suite before submitting

## Troubleshooting

### Common Test Failures

1. **Import/Module Issues**
   - Check file paths in imports
   - Verify mock setup
   - Ensure proper ESM syntax

2. **Timing Issues**
   - Add proper awaits for async operations
   - Use `waitFor` for DOM updates
   - Handle race conditions

3. **Environment Issues**
   - Check environment variable setup
   - Verify browser API mocks
   - Ensure proper test isolation

For additional help, check the test output logs and Vitest documentation.