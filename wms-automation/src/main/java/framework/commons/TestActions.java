package framework.commons;

import framework.configurations.Configuration;
import framework.utils.ExtentInit;
import framework.utils.TestLogger;
import org.apache.commons.io.FileUtils;
import org.openqa.selenium.OutputType;
import org.openqa.selenium.TakesScreenshot;
import org.openqa.selenium.WebDriver;
import org.openqa.selenium.remote.RemoteWebDriver;
import org.testng.IResultMap;
import org.testng.ITestResult;
import org.testng.internal.Utils;

import java.io.File;
import java.text.SimpleDateFormat;
import java.util.*;

public class TestActions extends TestLogger implements Configuration {

    private static final ThreadLocal<String> screenshotPathThread = ThreadLocal.withInitial(() -> "");

    public static String getScreenshotPath() {
        return screenshotPathThread.get();
    }

    public static void setScreenshotPath(String path) {
        screenshotPathThread.set(path);
    }

    public static void removeScreenshotPath() {
        screenshotPathThread.remove();
    }

    public static String getShortException(IResultMap tests) {
        String exceptions = "";
        ITestResult result = tests.getAllResults().stream().reduce((one, two) -> two).get();
        Throwable exception = result.getThrowable();
        boolean hasThrowable = exception != null;
        if (hasThrowable) {
            String str = Utils.shortStackTrace(exception, true);
            Scanner scanner = new Scanner(str);
            while (scanner.hasNextLine()) {
                String line = scanner.nextLine();
                if (line.trim().startsWith("at ")) break;
                exceptions = exceptions.concat(line + SEPARATOR);
            }
        }
        return exceptions;
    }

    public static String getExtentScreenShot(WebDriver driver, String screenshotName) {
        String destination = "";
        String screenshotPath = "Screenshots" + File.separator + screenshotName + "_" + getCurrentTimeStampString() + ".png";
        setScreenshotPath(screenshotPath);

        try {
            if (driver != null && isSessionActive(driver)) {
                TakesScreenshot ts = (TakesScreenshot) driver;
                File source = ts.getScreenshotAs(OutputType.FILE);
                destination = ExtentInit.REPORT_PATH + File.separator + screenshotPath;
                File finalDestination = new File(destination);
                FileUtils.copyFile(source, finalDestination);
            } else {
                TestLogger.warn("Driver is null or session is inactive. Skipping screenshot.");
            }
        } catch (Exception e) {
            TestLogger.error("Error capturing screenshot: " + e.getMessage());
            e.printStackTrace();
        }

        return screenshotPath;
    }

    public static boolean isSessionActive(WebDriver driver) {
        try {
            return ((RemoteWebDriver) driver).getSessionId() != null;
        } catch (Exception e) {
            return false;
        }
    }

    public static String getCurrentTimeStampString() {
        Date date = new Date();
        SimpleDateFormat sd = new SimpleDateFormat("MMddHHmmssSS");
        TimeZone timeZone = TimeZone.getDefault();
        Calendar cal = Calendar.getInstance(new SimpleTimeZone(timeZone.getOffset(date.getTime()), "GMT"));
        sd.setCalendar(cal);
        return sd.format(date);
    }

    public static void startRecording(String suiteName) throws Exception {
        // Optional: wire up a screen recorder here (e.g. monte-screen-recorder) if VIDEO_RECORD is used.
    }

    public static void stopRecording() throws Exception {
        // Pair with startRecording — stop/save the recording here.
    }

}
