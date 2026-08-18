package framework.commons;

import framework.configurations.Configuration;
import io.appium.java_client.android.AndroidDriver;

public class AppActions extends AppiumServices implements Configuration {

    public void closeApp(AndroidDriver driver) {
        driver.terminateApp(APP_PACKAGE);
    }

    public void launchApp(AndroidDriver driver) {
        driver.activateApp(APP_PACKAGE);
    }

}
