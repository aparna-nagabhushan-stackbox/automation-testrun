package framework.init;

import framework.configurations.Configuration;
import framework.listeners.BuildContext;
import org.openqa.selenium.chrome.ChromeOptions;
import org.openqa.selenium.edge.EdgeOptions;
import org.openqa.selenium.firefox.FirefoxOptions;

import java.util.HashMap;
import java.util.Map;


public class BrowserCaps implements Configuration {

    public static ChromeOptions configureGoogleChromeOptions() {
        ChromeOptions options = new ChromeOptions();

        if (IS_HEADLESS.equalsIgnoreCase("true")) {
            options.addArguments("--no-sandbox");
            options.addArguments("--disable-infobars");
            options.addArguments("--disable-dev-shm-usage");
            options.addArguments("--disable-popup-blocking");
            options.addArguments("--disable-default-apps");
            options.addArguments("--enable-precise-memory-info");
            options.addArguments("--start-maximized");
            options.addArguments("--headless");
            options.addArguments("--window-size=1920x1080");
        }

        Map<String, Object> preferences = new HashMap<>();
        preferences.put("profile.default_content_settings.popups", 0);
        preferences.put("download.default_directory", DOWNLOAD_FOLDER);
        options.addArguments("incognito");
        options.addArguments("--remote-allow-origins=*");

        options.setExperimentalOption("prefs", preferences);

        return options;
    }

    public static FirefoxOptions configureFirefoxOptions() {
        FirefoxOptions options = new FirefoxOptions();
        options.addArguments("incognito");
        options.addArguments("--remote-allow-origins=*");
        return options;
    }

    public static EdgeOptions configureEdgeOptions() {
        EdgeOptions options = new EdgeOptions();
        options.addArguments("incognito");
        options.addArguments("--remote-allow-origins=*");
        return options;
    }

    // The LambdaTest (cloud grid) options below are only needed if the new repo will also
    // run on LambdaTest. If it won't, delete configureLT*() and the IS_CLOUD branches
    // in DriverInit.initializeWebDriver()/initializeMobileDriver() that reference them.
    public static HashMap<String, Object> getLTOptions(String suiteName, String methodName) {
        HashMap<String, Object> ltOptions = new HashMap<>();
        ltOptions.put("username", LT_USERNAME);
        ltOptions.put("accessKey", LT_ACCESS_KEY);
        ltOptions.put("visual", true);
        ltOptions.put("video", true);
        ltOptions.put("resolution", "1920x1200");
        ltOptions.put("build", BuildContext.buildId());
        ltOptions.put("project", "Automation");
        ltOptions.put("name", methodName);
        String[] customTags = {suiteName};
        ltOptions.put("tags", customTags);
        ltOptions.put("console", "info");
        ltOptions.put("selenium_version", "4.0.0");
        ltOptions.put("plugin", "java-testNG");
        ltOptions.put("w3c", true);
        ltOptions.put("platformName", "Windows 10");
        ltOptions.put("idleTimeout", 450);
        return ltOptions;
    }

    public static ChromeOptions configureLTChromeOptions() {
        ChromeOptions browserOptions = new ChromeOptions();
        browserOptions.setCapability("platformName", "Windows 10");
        browserOptions.setBrowserVersion("latest");
        browserOptions.setCapability("LT:Options", getLTOptions(HelperInit.getSuiteName(), HelperInit.getMethodName()));
        return browserOptions;
    }

    public static FirefoxOptions configureLTFirefoxOptions() {
        FirefoxOptions browserOptions = new FirefoxOptions();
        browserOptions.setPlatformName("Windows 10");
        browserOptions.setBrowserVersion("latest");
        browserOptions.setCapability("LT:Options", getLTOptions(HelperInit.getSuiteName(), HelperInit.getMethodName()));
        return browserOptions;
    }

    public static EdgeOptions configureLTEdgeOptions() {
        EdgeOptions browserOptions = new EdgeOptions();
        browserOptions.setPlatformName("Windows 10");
        browserOptions.setBrowserVersion("latest");
        browserOptions.setCapability("LT:Options", getLTOptions(HelperInit.getSuiteName(), HelperInit.getMethodName()));
        return browserOptions;
    }

}
