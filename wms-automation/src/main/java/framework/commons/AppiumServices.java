package framework.commons;

import framework.configurations.Configuration;
import framework.utils.TestLogger;
import io.appium.java_client.service.local.AppiumDriverLocalService;
import io.appium.java_client.service.local.AppiumServiceBuilder;
import io.appium.java_client.service.local.flags.GeneralServerFlag;

public class AppiumServices extends BrowserActions implements Configuration {

    private static AppiumDriverLocalService appiumDriverLocalService;

    public static void startAppiumServer() {
        TestLogger.info("Appium Server is starting...");

        AppiumServiceBuilder serviceBuilder = new AppiumServiceBuilder()
                .withIPAddress(APPIUM_HUB)
                .usingPort(Integer.parseInt(APPIUM_PORT))
                .withArgument(GeneralServerFlag.SESSION_OVERRIDE)
                .withArgument(GeneralServerFlag.LOG_LEVEL, "error");

        appiumDriverLocalService = AppiumDriverLocalService.buildService(serviceBuilder);
        appiumDriverLocalService.start();

        TestLogger.info("Appium Server started successfully");
    }

    public static void stopAppiumServer() {
        if (appiumDriverLocalService != null && appiumDriverLocalService.isRunning()) {
            TestLogger.info("Stopping Appium Server gracefully...");
            appiumDriverLocalService.stop();
            TestLogger.info("Appium Server stopped successfully");
        }
    }

}
