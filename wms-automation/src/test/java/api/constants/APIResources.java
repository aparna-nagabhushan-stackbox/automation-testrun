// EXAMPLE from platform-regression-suite's src/test/java/api/constants/APIResources.java
// Every API path used by an api.builder.*Builder class is a named constant here, grouped
// by module with a /** MODULE NAME */ comment header — builders never inline a raw path string.

package api.constants;

public interface APIResources {

    /**
     * AUTHENTICATION
     */
    String LOGIN = "/core/login";
    String GET_ALL_NODES = "/core/node";

    // Add one block per module as it's automated, e.g.:
    // /**
    //  * INVENTORY
    //  */
    // String BIN_INVENTORY = "/wms/storage/inventory/dashboard";
}
