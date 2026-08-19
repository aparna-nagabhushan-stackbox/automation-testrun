package framework.listeners;

import framework.configurations.Configuration;
import framework.utils.TestLogger;
import org.testng.IRetryAnalyzer;
import org.testng.ITestResult;

public class RetryListener implements IRetryAnalyzer, Configuration {

    int counter = 1;
    int retryLimit = RETRY_COUNT;

    @Override
    public boolean retry(ITestResult result) {
        if (IS_RETRY_ENABLED) {
            if (counter < retryLimit) {
                TestLogger.error("Test Failed, retrying it - " + counter);
                TestLogger.debug("Test Name : " + result.getName());
                TestLogger.debug("Retry Count : " + counter);
                counter++;
                return true;
            }
            return false;
        } else {
            return false;
        }
    }
}
