package framework.listeners;

import framework.annotations.Mobile;
import framework.annotations.Web;
import framework.configurations.Configuration;
import framework.init.BrowserCaps;
import framework.init.HelperInit;
import framework.init.MobileCaps;
import framework.utils.ExtentInit;
import framework.utils.TestLogger;
import io.appium.java_client.android.AndroidDriver;
import org.openqa.selenium.JavascriptExecutor;
import org.openqa.selenium.WebDriver;
import org.openqa.selenium.chrome.ChromeDriver;
import org.openqa.selenium.edge.EdgeDriver;
import org.openqa.selenium.firefox.FirefoxDriver;
import org.openqa.selenium.remote.RemoteWebDriver;
import org.testng.ITestListener;
import org.testng.ITestResult;

import java.io.File;
import java.lang.reflect.Method;

/**
 * Every test class extends this. It reads @Web/@Mobile off the running @Test method to decide
 * which driver(s) to spin up, and tears them down (with screenshot-on-failure) after every test.
 *
 * NOTE: this bootstrap drops the ReportPortal @Attributes requirement that the platform-regression-suite
 * original enforces in onTestStart (it asserts every @Test method carries an @Attributes block for
 * ReportPortal test-case metadata). Add that back — see conventions.md "Required annotations" — only
 * if the new repo also reports to ReportPortal; otherwise the assert will fail every test that lacks it.
 */
public class DriverInit extends HelperInit implements ITestListener {

    private static final ThreadLocal<WebDriver> webDriverThread = new ThreadLocal<>();
    private static final ThreadLocal<AndroidDriver> mobileDriverThread = new ThreadLocal<>();
    private static final ThreadLocal<Boolean> isWebTestThread = ThreadLocal.withInitial(() -> false);
    private static final ThreadLocal<Boolean> isMobileTestThread = ThreadLocal.withInitial(() -> false);
    private static final ThreadLocal<String> testIdThread = ThreadLocal.withInitial(() -> "");

    @Deprecated
    protected WebDriver webDriver;

    @Deprecated
    protected AndroidDriver mobileDriver;

    public WebDriver getWebDriver() {
        return webDriverThread.get();
    }

    public AndroidDriver getMobileDriver() {
        return mobileDriverThread.get();
    }

    public boolean isWebTest() {
        return isWebTestThread.get();
    }

    public boolean isMobileTest() {
        return isMobileTestThread.get();
    }

    public String getTestId() {
        return testIdThread.get();
    }

    public static String testId() {
        return testIdThread.get();
    }

    @Override
    public void onTestStart(ITestResult result) {

        Method testMethod = result.getMethod().getConstructorOrMethod().getMethod();

        isWebTestThread.set(testMethod.isAnnotationPresent(Web.class));
        isMobileTestThread.set(testMethod.isAnnotationPresent(Mobile.class));

        if (isWebTest()) {
            TestLogger.info("Preparing Browser Setup for the execution...");
            WebDriver driver = initializeWebDriver();
            webDriverThread.set(driver);
            Object testInstance = result.getInstance();
            if (testInstance instanceof DriverInit) {
                ((DriverInit) testInstance).webDriver = driver;
            }
            this.webDriver = driver;
            TestLogger.info("Web Drivers Initialized successfully");
            pause(2);
            testIdThread.set(String.valueOf(getWebDriver().hashCode()));
        }

        if (isMobileTest() && !isWebTest()) {
            AndroidDriver driver = initializeMobileDriver();
            mobileDriverThread.set(driver);
            Object testInstance = result.getInstance();
            if (testInstance instanceof DriverInit) {
                ((DriverInit) testInstance).mobileDriver = driver;
            }
            this.mobileDriver = driver;
        }
    }

    @Override
    public void onTestFailure(ITestResult result) {
        String testName = result.getName();

        if (isWebTest()) {
            if (getWebDriver() != null && ((RemoteWebDriver) getWebDriver()).getSessionId() != null) {
                String screenshotPath = IS_SCREENSHOT ? ExtentInit.REPORT_PATH + File.separator + getExtentScreenShot(getWebDriver(), testName) : null;
                TestLogger.error("TEST FAILED", screenshotPath, result);
            } else {
                throw new RuntimeException("Something went wrong, WebDriver not initialised for @Web test, exiting the test");
            }
        }

        if (isMobileTest()) {
            if (getMobileDriver() != null && getMobileDriver().getSessionId() != null) {
                String screenshotPath = IS_SCREENSHOT ? ExtentInit.REPORT_PATH + File.separator + getExtentScreenShot(getMobileDriver(), testName) : null;
                TestLogger.error("TEST FAILED", screenshotPath, result);
            } else if (!isWebTest()) {
                throw new RuntimeException("Something went wrong, MobileDriver not initialised for @Mobile test, exiting the test");
            }
        }

        if (IS_CLOUD) {
            if (isWebTest() && getWebDriver() != null && ((RemoteWebDriver) getWebDriver()).getSessionId() != null)
                ((JavascriptExecutor) getWebDriver()).executeScript("lambda-status=failed");
            if (isMobileTest() && getMobileDriver() != null && getMobileDriver().getSessionId() != null)
                getMobileDriver().executeScript("lambda-status=failed");
        }

        if (isWebTest() && getWebDriver() != null && ((RemoteWebDriver) getWebDriver()).getSessionId() != null) {
            deleteCookies(getWebDriver());
            quit(getWebDriver());
        }
        if (isMobileTest() && getMobileDriver() != null && getMobileDriver().getSessionId() != null) {
            quit(getMobileDriver());
        }

        cleanupThreadLocals();
    }

    @Override
    public void onTestSuccess(ITestResult result) {
        String testName = result.getName();

        if (isWebTest() && ((RemoteWebDriver) getWebDriver()).getSessionId() != null) {
            String screenshotPath = IS_SCREENSHOT ? ExtentInit.REPORT_PATH + File.separator + getExtentScreenShot(getWebDriver(), testName) : null;
            TestLogger.pass("TEST PASSED", screenshotPath, result);
        }

        if (isMobileTest() && getMobileDriver() != null)
            if (getMobileDriver().getSessionId() != null) {
                String screenshotPath = IS_SCREENSHOT ? ExtentInit.REPORT_PATH + File.separator + getExtentScreenShot(getMobileDriver(), testName) : null;
                TestLogger.pass("TEST PASSED", screenshotPath, result);
            }

        if (IS_CLOUD) {
            if (isWebTest() && ((RemoteWebDriver) getWebDriver()).getSessionId() != null)
                ((JavascriptExecutor) getWebDriver()).executeScript("lambda-status=passed");
            if (isMobileTest() && getMobileDriver() != null)
                if (getMobileDriver().getSessionId() != null)
                    getMobileDriver().executeScript("lambda-status=passed");
        }

        if (isWebTest() && ((RemoteWebDriver) getWebDriver()).getSessionId() != null) {
            deleteCookies(getWebDriver());
            quit(getWebDriver());
        }
        if (isMobileTest() && getMobileDriver() != null)
            if (getMobileDriver().getSessionId() != null) quit(getMobileDriver());

        cleanupThreadLocals();
    }

    @Override
    public void onTestSkipped(ITestResult result) {
        cleanupThreadLocals();
    }

    public WebDriver initializeWebDriver() {
        WebDriver driver;
        if (!IS_CLOUD) {
            driver = switch (BROWSER.toLowerCase()) {
                case "firefox", "mozilla firefox" -> new FirefoxDriver(BrowserCaps.configureFirefoxOptions());
                case "edge", "ms edge", "microsoft edge" -> new EdgeDriver(BrowserCaps.configureEdgeOptions());
                default -> new ChromeDriver(BrowserCaps.configureGoogleChromeOptions());
            };
        } else {
            if (LT_USERNAME == null || LT_USERNAME.isEmpty() ||
                    LT_ACCESS_KEY == null || LT_ACCESS_KEY.isEmpty()) {
                throw new RuntimeException("No LambdaTest credentials found, " +
                        "\nplease add LT_USERNAME and LT_ACCESS_KEY to run test in cloud");
            }
            driver = switch (BROWSER.toLowerCase()) {
                case "firefox", "mozilla firefox" ->
                        new RemoteWebDriver(Configuration.getRemoteGridURL(true), BrowserCaps.configureLTFirefoxOptions());
                case "edge", "ms edge", "microsoft edge" ->
                        new RemoteWebDriver(Configuration.getRemoteGridURL(true), BrowserCaps.configureLTEdgeOptions());
                default ->
                        new RemoteWebDriver(Configuration.getRemoteGridURL(true), BrowserCaps.configureLTChromeOptions());
            };
        }

        maximizeWindow(driver);
        openURL(driver, URL);
        implicitWaitOf(driver, IMPLICIT_WAIT);
        webDriverThread.set(driver);
        this.webDriver = driver;
        return driver;
    }

    public AndroidDriver initializeMobileDriver() {
        TestLogger.info("Preparing Android Device Setup for the execution...");
        AndroidDriver driver = new AndroidDriver(Configuration.getRemoteGridURL(false),
                IS_CLOUD ? MobileCaps.configureLTAndroid() : MobileCaps.configureAndroid());
        implicitWaitOf(driver, IMPLICIT_WAIT);
        TestLogger.info("Driver Initialized successfully");
        pause(2);
        if (getTestId().isEmpty()) testIdThread.set(String.valueOf(driver.hashCode()));
        mobileDriverThread.set(driver);
        this.mobileDriver = driver;
        return driver;
    }

    private void cleanupThreadLocals() {
        webDriverThread.remove();
        mobileDriverThread.remove();
        isWebTestThread.remove();
        isMobileTestThread.remove();
        this.webDriver = null;
        this.mobileDriver = null;
        removeScreenshotPath();
    }

    public static void clearTestId() {
        testIdThread.remove();
    }

}
