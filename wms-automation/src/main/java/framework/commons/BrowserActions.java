package framework.commons;

import framework.configurations.Configuration;
import org.openqa.selenium.JavascriptExecutor;
import org.openqa.selenium.WebDriver;

import java.time.Duration;
import java.util.Set;

public class BrowserActions extends Random implements Configuration {

    public static void switchToChildWindow(WebDriver driver) {
        String parentWindow = driver.getWindowHandle();
        Set<String> windowHandles = driver.getWindowHandles();
        for (String windowHandle : windowHandles) {
            if (!windowHandle.equals(parentWindow)) {
                driver.switchTo().window(windowHandle);
                break;
            }
        }
    }

    public static void switchToParentWindow(WebDriver driver) {
        String parentWindow = driver.getWindowHandle();
        driver.switchTo().window(parentWindow);
    }

    public static void closeChildWindow(WebDriver driver) {
        driver.close();
    }

    public static void openURL(WebDriver driver, String url) {
        driver.get(url);
    }

    public static String getTitle(WebDriver driver) {
        return driver.getTitle();
    }

    public static void close(WebDriver driver) {
        driver.close();
    }

    public static void refresh(WebDriver driver) {
        driver.navigate().refresh();
    }

    public static long getPageLoadTime(WebDriver driver) {
        JavascriptExecutor js = (JavascriptExecutor) driver;
        Long navigationStart = (Long) js.executeScript("return window.performance.timing.navigationStart;");
        Long loadEventEnd = (Long) js.executeScript("return window.performance.timing.loadEventEnd;");
        return loadEventEnd - navigationStart;
    }

    public void deleteCookies(WebDriver driver) {
        driver.manage().deleteAllCookies();
    }

    public void quit(WebDriver driver) {
        driver.quit();
    }

    public void maximizeWindow(WebDriver driver) {
        driver.manage().window().maximize();
    }

    public void implicitWaitOf(WebDriver driver, int... seconds) {
        driver.manage().timeouts().implicitlyWait(Duration.ofSeconds(seconds.length != 0 ? seconds[0] : IMPLICIT_WAIT));
    }

}
