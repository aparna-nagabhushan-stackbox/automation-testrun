// EXAMPLE from platform-regression-suite's src/test/java/constants/DataKeys.java
// Every string key used in testdata/{env}.json MUST have a matching constant here —
// tests never reference a raw string literal like "branchName" directly.
// Group by module with a comment header as the file grows; numbered variants (SKU, SKU1, SKU2)
// are the established way to handle "second/third value of the same kind" in one test case.

package constants;

public class DataKeys {

    // Common
    public static final String BRANCH_NAME = "branchName";
    public static final String WORKER_ID = "workerId";

    // Add module-specific keys below, grouped under a comment per module, e.g.:
    // // Inventory
    // public static final String BIN_CODE = "binCode";
    // public static final String SKU_CODE = "skuCode";
}
