package framework.listeners;

public class BuildContext {
    private static String buildId;

    public static String buildId() {
        return buildId;
    }

    public static void setBuildId(String buildId) {
        BuildContext.buildId = buildId;
    }
}
