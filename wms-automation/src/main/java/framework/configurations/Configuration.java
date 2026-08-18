package framework.configurations;

import framework.enums.Environment;
import framework.enums.PropTypes;
import framework.utils.TestLogger;

import java.io.File;
import java.io.FileInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.net.MalformedURLException;
import java.net.URL;
import java.util.Properties;

/**
 * Central place for every environment-driven constant. Values are resolved once at classload
 * from src/test/resources/configurations/{env}/*.properties, keyed by -Denv on the mvn command line.
 * Add new constants here rather than reading properties files directly from tests/POs/builders.
 */
public interface Configuration {

    String SEPARATOR = "<br>";

    String PROJECT_DIR = getProjectDir();
    String DOWNLOAD_FOLDER = PROJECT_DIR + File.separator + "downloads";
    String JSON_PATH = PROJECT_DIR + File.separator +
            "src/test/resources" + File.separator +
            "jsonfiles" + File.separator +
            Environment.getCurrentEnv().value() + File.separator;

    String BROWSER = getProperty(PropTypes.WEB.value(), "browser");
    String URL = getProperty(PropTypes.WEB.value(), "url");
    String API_URL = getProperty(PropTypes.API.value(), "api.url");

    String USERNAME = getProperty(PropTypes.WEB.value(), "username");
    String PASSWORD = getProperty(PropTypes.WEB.value(), "password");

    String VIDEO_RECORD = getProperty(PropTypes.CONFIG.value(), "record.video").isEmpty()
            ? "false" : getProperty(PropTypes.CONFIG.value(), "record.video");

    int IMPLICIT_WAIT = Integer.parseInt(getProperty(PropTypes.CONFIG.value(), "implicit.wait"));
    int EXPLICIT_WAIT = Integer.parseInt(getProperty(PropTypes.CONFIG.value(), "explicit.wait"));
    int STATIC_WAIT = Integer.parseInt(getProperty(PropTypes.CONFIG.value(), "static.wait"));

    String IS_HEADLESS = getProperty(PropTypes.CONFIG.value(), "is.headless");

    String APP_ID = getProperty(PropTypes.MOBILE.value(), "app.id");
    String DEVICE_ID = getProperty(PropTypes.MOBILE.value(), "device.id");
    String APK_FILE = PROJECT_DIR + File.separator +
            "src/test/resources" + File.separator +
            "apps" + File.separator +
            Environment.getCurrentEnv().value() + File.separator +
            "release.apk";

    String APP_PACKAGE = getProperty(PropTypes.MOBILE.value(), "app.package");
    String APP_ACTIVITY = getProperty(PropTypes.MOBILE.value(), "app.activity");

    String APPIUM_HUB = getProperty(PropTypes.MOBILE.value(), "appium.hub");
    String APPIUM_PORT = getProperty(PropTypes.MOBILE.value(), "appium.port");

    boolean IS_CLOUD = getCloudRun();

    boolean IS_DEBUG = Boolean.parseBoolean(getProperty(PropTypes.CONFIG.value(), "is.debug"));

    boolean IS_SCREENSHOT = Boolean.parseBoolean(getProperty(PropTypes.CONFIG.value(), "is.screenshot"));

    int RETRY_COUNT = Integer.parseInt(getProperty(PropTypes.CONFIG.value(), "retry.count"));
    boolean IS_RETRY_ENABLED = Boolean.parseBoolean(getProperty(PropTypes.CONFIG.value(), "is.retry"));

    String LT_USERNAME = System.getenv("LT_USERNAME");
    String LT_ACCESS_KEY = System.getenv("LT_ACCESS_KEY");

    String REPORT_PORTAL_URL = getProperty(PropTypes.REPORT.value(), "report.url");
    String REPORT_PORTAL_API_KEY = System.getenv("REPORT_KEY");
    String REPORT_PORTAL_PROJECT_NAME = System.getProperty("report");

    // Add one constant here per reset/seed JSON file under src/test/resources/jsonfiles/{env}/
    // as new modules are automated, e.g.:
    // String INVENTORY_PATH = JSON_PATH + "reset-inventory.json";

    String IMAGES = PROJECT_DIR + File.separator + "src/test/resources" + File.separator + "images";
    String TEST_DATA_PATH = PROJECT_DIR + File.separator + "testdata" +
            File.separator + Environment.getCurrentEnv().value() + ".json";

    static URL getRemoteGridURL(boolean isWeb) {

        URL REMOTE_GRID_URL = null;

        if (!IS_CLOUD) {
            try {
                REMOTE_GRID_URL = new URL("http://" + APPIUM_HUB + ":" + APPIUM_PORT);
            } catch (MalformedURLException ex) {
                TestLogger.debug("Error occurred in Remote Grid URL.");
            }
        } else {
            if (isWeb) {
                try {
                    REMOTE_GRID_URL = new URL("http://hub.lambdatest.com/wd/hub");
                } catch (MalformedURLException ex) {
                    TestLogger.debug("Error occurred in Remote Grid URL.");
                }
            } else {
                try {
                    REMOTE_GRID_URL = new URL("https://" +
                            LT_USERNAME + ":" + LT_ACCESS_KEY +
                            "@mobile-hub.lambdatest.com/wd/hub");
                } catch (MalformedURLException ex) {
                    TestLogger.debug("Error occurred in Remote Grid URL.");
                }
            }
        }

        return REMOTE_GRID_URL;
    }

    static String getProjectDir() {
        return System.getProperty("user.dir");
    }

    static String getProperty(String file, String key) {
        return getProperties(file).getProperty(key);
    }

    static Properties getProperties(String file) {
        InputStream input = null;
        Properties prop = new Properties();
        String propertyFile = PROJECT_DIR + File.separator
                + "src/test/resources" + File.separator
                + "configurations" + File.separator
                + Environment.getCurrentEnv().value() + File.separator
                + file + ".properties";
        try {
            input = new FileInputStream(propertyFile);
            prop.load(input);
        } catch (Exception e) {
            System.err.println("Error occurred while reading the file - " + propertyFile);
            e.printStackTrace();
        } finally {
            if (input != null)
                try {
                    input.close();
                } catch (IOException e) {
                    e.printStackTrace();
                }
        }
        return prop;
    }

    static boolean getCloudRun() {
        String envValue = System.getenv("IS_CLOUD");
        if (envValue != null) {
            return Boolean.parseBoolean(envValue);
        }
        return Boolean.parseBoolean(getProperty(PropTypes.CONFIG.value(), "is.cloud"));
    }

}
