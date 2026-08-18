package framework.enums;

public enum Environment {
    STG("stg"),
    UAT("uat");

    private final String value;

    Environment(String value) {
        this.value = value;
    }

    public String value() {
        return value;
    }

    public static Environment fromValue(String value) {
        for (Environment env : Environment.values()) {
            if (env.value.equalsIgnoreCase(value)) {
                return env;
            }
        }
        throw new IllegalArgumentException("Unknown environment: " + value);
    }

    public static Environment getCurrentEnv() {
        String envValue = System.getProperty("env");
        return fromValue(envValue);
    }
}
