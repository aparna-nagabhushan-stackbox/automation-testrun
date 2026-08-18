package framework.utils;

/**
 * Implement on a test class when a test creates state (sessions, in-progress movements, etc.)
 * that must be torn down before TestNG retries the same test method.
 * RetryListener/RetryTransformer don't call this automatically — wire the call into the
 * test class's own retry-aware logic (see conventions.md for the pattern).
 */
public interface RetryCleanup {
    void cleanUpAfterRetry();
}
