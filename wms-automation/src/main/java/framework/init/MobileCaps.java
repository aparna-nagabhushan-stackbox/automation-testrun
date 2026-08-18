package framework.init;

import framework.configurations.Configuration;
import framework.listeners.BuildContext;
import io.appium.java_client.android.options.UiAutomator2Options;
import org.openqa.selenium.Platform;
import org.openqa.selenium.remote.DesiredCapabilities;

import java.time.Duration;
import java.util.HashMap;

import static framework.listeners.ExecutionListener.APP_URL;

/**
 * setApp(APK_FILE) assumes the .apk lives at src/test/resources/apps/{env}/release.apk
 * (see Configuration.APK_FILE). If the new repo downloads the build instead of committing it,
 * add that download step here before setApp() is called.
 */
public class MobileCaps implements Configuration {

    public static UiAutomator2Options configureAndroid() {
        UiAutomator2Options options = new UiAutomator2Options();
        options.setCapability("appium:hideKeyboard", true);

        return options
                .setDeviceName(DEVICE_ID)
                .setPlatformName(String.valueOf(Platform.ANDROID))
                .setApp(APK_FILE)
                .setAppPackage(APP_PACKAGE)
                .setAppActivity(APP_ACTIVITY)
                .setFullReset(false)
                .setNoReset(false)
                .setAutoGrantPermissions(true)
                .setNewCommandTimeout(Duration.ofMinutes(1))
                .setAdbExecTimeout(Duration.ofMinutes(1))
                .eventTimings();
    }

    // Only needed if the new repo also runs mobile tests on LambdaTest's cloud device farm.
    public static DesiredCapabilities configureLTAndroid() {

        DesiredCapabilities capabilities = new DesiredCapabilities();
        HashMap<String, Object> ltOptions = new HashMap<>();
        ltOptions.put("w3c", true);
        ltOptions.put("platformName", "android");
        ltOptions.put("app", APP_URL);
        ltOptions.put("devicelog", true);
        ltOptions.put("visual", true);
        ltOptions.put("video", true);
        ltOptions.put("build", BuildContext.buildId());
        ltOptions.put("name", HelperInit.getMethodName());
        ltOptions.put("project", "Automation");
        ltOptions.put("deviceOrientation", "portrait");
        ltOptions.put("autoGrantPermissions", true);
        ltOptions.put("isRealMobile", true);
        capabilities.setCapability("lt:options", ltOptions);

        return capabilities;
    }

}
