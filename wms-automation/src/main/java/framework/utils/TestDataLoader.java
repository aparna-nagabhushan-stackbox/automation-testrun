package framework.utils;

import com.google.gson.Gson;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;

import java.io.FileReader;
import java.util.Map;

import static framework.configurations.Configuration.TEST_DATA_PATH;

/**
 * Loads testdata/{env}.json once at classload and serves it by module + test case ID.
 * Tests must never hardcode data values — always route through getTestData()/getTestDataField()
 * so the same test runs unmodified against every environment.
 */
public class TestDataLoader {

    private static JsonObject testData;

    static {
        try {
            FileReader reader = new FileReader(TEST_DATA_PATH);
            testData = JsonParser.parseReader(reader).getAsJsonObject();
            reader.close();
        } catch (Exception e) {
            throw new RuntimeException("Failed to load test data file: " + TEST_DATA_PATH);
        }
    }

    public static Map<String, String> getTestData(String moduleName, String testCaseId) {
        try {
            JsonObject moduleData = testData.getAsJsonArray(moduleName)
                    .get(0)
                    .getAsJsonObject();

            JsonObject testCaseData = moduleData.getAsJsonObject(testCaseId);

            if (testCaseData == null) {
                throw new RuntimeException("Test case " + testCaseId + " not found in module " + moduleName);
            }

            TestLogger.info("Test data loaded successfully for " + testCaseId);
            Gson gson = new Gson();
            return gson.fromJson(testCaseData, Map.class);

        } catch (Exception e) {
            throw new RuntimeException("Error fetching test data for " + moduleName + " - " + testCaseId);
        }
    }

    public static String getTestDataField(String moduleName, String testCaseId, String fieldName) {
        Map<String, String> data = getTestData(moduleName, testCaseId);
        return data.get(fieldName);
    }

}
