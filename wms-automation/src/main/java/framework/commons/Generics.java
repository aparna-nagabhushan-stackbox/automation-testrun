package framework.commons;

import framework.configurations.DateTimeFormat;
import org.json.simple.JSONObject;
import org.openqa.selenium.By;
import org.openqa.selenium.WebDriver;
import org.openqa.selenium.WebElement;
import org.testng.Assert;

import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Base class for every Page Object and API Builder. Inherits the whole
 * ElementActions/AppActions/AppiumServices/BrowserActions/Random/Scroller/TestActions chain,
 * so any PO or Builder that `extends Generics` gets element actions, logging, and Configuration
 * constants for free without needing its own imports for each layer.
 */
public class Generics extends ElementActions implements DateTimeFormat {

    private long startTime;
    private String label;

    public static void pause(int... secs) {
        try {
            Thread.sleep((secs.length != 0 ? secs[0] : STATIC_WAIT) * 1000L);
        } catch (InterruptedException interruptedException) {
            System.err.println("Something went wrong in pause...");
        }
    }

    public static void pause(long... ms) {
        try {
            Thread.sleep((ms.length != 0 ? ms[0] : STATIC_WAIT));
        } catch (InterruptedException interruptedException) {
            System.err.println("Something went wrong in pause...");
        }
    }

    public static boolean isListEmpty(List<?> list) {
        return list.isEmpty();
    }

    public static int sizeOf(List<?> list) {
        return list.size();
    }

    public static int lastIndexOf(List<?> list) {
        return sizeOf(list) - 1;
    }

    public static double getDoubleFromString(String str) {
        return Double.parseDouble(str.replaceAll("[^0-9.-]+", ""));
    }

    public static Map<String, Object> jsonObjectToMap(JSONObject jsonObject) {
        Map<String, Object> map = new HashMap<>();
        for (Object key : jsonObject.keySet()) {
            map.put((String) key, jsonObject.get(key));
        }
        return map;
    }

    public static String capitalizeFirstLetter(String input) {
        if (input == null || input.isEmpty()) {
            return input;
        }
        return input.substring(0, 1).toUpperCase()
                + input.substring(1).toLowerCase();
    }

    public void start(String label) {
        this.label = label;
        this.startTime = System.nanoTime();
    }

    public void stop() {
        long elapsed = System.nanoTime() - startTime;
        double seconds = elapsed / 1_000_000_000.0;
        testStepsLog(label + " took " + seconds + " seconds");
    }

    public void assertContains(String actual, String expected) {
        Assert.assertTrue(
                actual.contains(expected),
                "Expected contains [" + expected + "] but found [" + actual + "]"
        );
    }

    public Map<String, String> getTableRowData(WebDriver driver, int rowIndex) {
        Map<String, String> rowData = new LinkedHashMap<>();

        List<WebElement> headers = driver.findElements(
                By.xpath("//thead//tr//th"));

        List<WebElement> cells = driver.findElements(
                By.xpath("//tbody//tr[" + rowIndex + "]//td"));

        for (int i = 0; i < headers.size(); i++) {
            String headerName = headers.get(i).getText().trim();
            if (headerName.isEmpty()) {
                continue;
            }
            if (i < cells.size()) {
                String cellValue = cells.get(i).getText().trim();
                rowData.put(headerName, cellValue);
            }
        }

        return rowData;
    }

}
