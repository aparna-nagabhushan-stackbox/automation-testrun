package framework.utils;

import com.aventstack.extentreports.ExtentTest;
import com.aventstack.extentreports.Status;
import com.aventstack.extentreports.markuputils.ExtentColor;
import com.aventstack.extentreports.markuputils.MarkupHelper;
import framework.configurations.Configuration;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.testng.ITestResult;
import org.testng.Reporter;

/**
 * The logging surface every Page Object / Test / Builder calls through (inherited via Generics).
 * Pick the right call by what you're recording, not by habit:
 *   testStepsLog        - an action being performed ("Click on Login Button")
 *   testInfoLog          - a data point entered/observed (key, value)
 *   testVerifyLog        - marks the line right before an assertion
 *   testConfirmationLog  - a fact confirmed as a side effect (e.g. captured Worker ID)
 *   testAPILog           - API-layer calls only, used inside api.builder.* classes
 *   testCaseLog          - fired once per test by DriverInit.onTestStart from @Attributes, not called directly
 */
public class TestLogger extends ExtentInit implements Configuration {

    private static Logger getLogger() {
        String callingClassName = new Throwable().getStackTrace()[2].getClassName();
        return LoggerFactory.getLogger(callingClassName);
    }

    public static void pass(String message, String screenshot, ITestResult result) {
        Reporter.setCurrentTestResult(result);
        ExtentTest extLogger = getExtentLogger();
        if (extLogger != null) {
            extLogger.log(Status.PASS,
                    MarkupHelper.createLabel("TEST CASE PASSED : "
                            + result.getMethod().getMethodName(), ExtentColor.GREEN));
            if (IS_SCREENSHOT && screenshot != null && !screenshot.isEmpty())
                extLogger.addScreenCaptureFromPath(screenshot);
        }
    }

    public static void info(String message) {
        getLogger().info(message);
        Reporter.log(message);
        ExtentTest extLogger = getExtentLogger();
        if (extLogger != null) extLogger.info(message);
    }

    public static void info(String message, String message2) {
        getLogger().info("{} : {}", message, message2);
        Reporter.log(message);
        ExtentTest extLogger = getExtentLogger();
        if (extLogger != null) extLogger.info(message + " : " + message2);
    }

    public static void debug(String message) {
        if (IS_DEBUG) {
            getLogger().debug(message);
            System.out.println(message);
            Reporter.log(message);
        }
    }

    public static void error(String message, Throwable... throwable) {
        ExtentTest extLogger = getExtentLogger();
        if (throwable.length == 0) {
            getLogger().error(message);
            Reporter.log(message);
            if (extLogger != null) extLogger.info(MarkupHelper.createLabel(message, ExtentColor.RED));
        } else {
            getLogger().error(message, throwable[0]);
            Reporter.log(message + "\n" + throwable[0]);
            if (extLogger != null) {
                extLogger.info(MarkupHelper.createLabel("Test Failure", ExtentColor.RED));
                extLogger.info(throwable[0]);
            }
        }
    }

    public static void error(String message, String screenshot, ITestResult result) {
        Throwable throwable = result.getThrowable();

        getLogger().error(message, throwable);
        getLogger().error("Screenshot: {}", screenshot);

        Reporter.log(message + "\n" + throwable);
        Reporter.setCurrentTestResult(result);

        ExtentTest extLogger = getExtentLogger();
        if (extLogger != null) {
            extLogger.log(Status.FAIL,
                    MarkupHelper.createLabel("TEST CASE FAILED : "
                            + result.getMethod().getMethodName(), ExtentColor.RED));
            extLogger.fail(throwable);
            if (IS_SCREENSHOT && screenshot != null && !screenshot.isEmpty())
                extLogger.addScreenCaptureFromPath(screenshot);
        }
    }

    public static void warn(String message) {
        getLogger().warn(message);
        Reporter.log(message);
    }

    public static void log(String log) {
        Reporter.log("<br></br>" + log);
    }

    public static void testCaseLog(String log, String... author) {
        getLogger().info("****************************************************************");
        getLogger().info(log);
        getLogger().info("****************************************************************");
        ExtentTest test = extent.createTest(log);
        test.assignAuthor(author);
        setExtentLogger(test);
    }

    public static void testInfoLog(String key, String value) {
        getLogger().info("{} : {}", key, value);
        ExtentTest extLogger = getExtentLogger();
        if (extLogger != null) extLogger.info(key + " : " + value);
        log("<strong>[INFO] - " + key + " : </strong><font color=#9400D3>" + value + "</font>");
    }

    public static void testStepsLog(String log) {
        getLogger().info(log);
        ExtentTest extLogger = getExtentLogger();
        if (extLogger != null) extLogger.info(log);
        log("[STEP] - " + log);
    }

    public static void testVerifyLog(String log) {
        getLogger().info(log);
        ExtentTest extLogger = getExtentLogger();
        if (extLogger != null) extLogger.info(MarkupHelper.createLabel(log, ExtentColor.ORANGE));
        log("[ASSERT] - <font color=#000080>" + log + "</font>");
    }

    public static void testConfirmationLog(String log) {
        getLogger().info(log);
        ExtentTest extLogger = getExtentLogger();
        if (extLogger != null) extLogger.info(MarkupHelper.createLabel(log, ExtentColor.TEAL));
        log("Confirmation Message : <Strong><font color=#008000>" + log + "</strong></font>");
    }

    public static void testWarningLog(String log) {
        getLogger().info(log);
        ExtentTest extLogger = getExtentLogger();
        if (extLogger != null) extLogger.warning(MarkupHelper.createLabel(log, ExtentColor.AMBER));
        log("Warning Message : <Strong><font color=#FF1870>" + log + "</strong></font>");
    }

    public static void testAPILog(String log) {
        getLogger().info("API CALL - " + log);
        ExtentTest extLogger = getExtentLogger();
        if (extLogger != null) extLogger.info("API CALL - " + log);
        log("<Strong><font color=#ff0000>" + log + "</strong></font>");
    }

}
