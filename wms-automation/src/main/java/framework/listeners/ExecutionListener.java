package framework.listeners;

import framework.commons.Generics;
import framework.configurations.Configuration;
import framework.enums.Environment;
import framework.utils.ExtentInit;
import framework.utils.TestLogger;
import org.testng.IExecutionListener;
import org.testng.ISuite;
import org.testng.ISuiteListener;

/**
 * Suite-level lifecycle: starts/stops the local Appium server (or resolves the cloud app ID),
 * initializes the ExtentReports HTML report, and logs a start/end summary.
 * Register this AFTER DriverInit and RetryTransformer in every suite XML's <listeners> block.
 */
public class ExecutionListener implements IExecutionListener, Configuration, ISuiteListener {

    public static String APP_URL = "";
    public static String suiteName;

    @Override
    public void onExecutionStart() {
        if (!IS_CLOUD) {
            Generics.startAppiumServer();
        } else {
            // Set APP_URL to the LambdaTest app id for this build, e.g. from mobile.properties (app.id)
            // or by uploading the .apk via LambdaTest's API and capturing the returned lt:// id.
            APP_URL = APP_ID;
        }
        ExtentInit.initializeReport(String.valueOf(System.currentTimeMillis()));
        TestLogger.info("Test execution Initialized...");
        TestLogger.info("Environment : " + Environment.getCurrentEnv());
    }

    @Override
    public void onStart(ISuite suite) {
        suiteName = suite.getName();
    }

    @Override
    public void onExecutionFinish() {
        if (!IS_CLOUD) {
            Generics.stopAppiumServer();
        }
        ExtentInit.flushReport();
        TestLogger.info("Test execution is finished...");
    }

}
