package framework.enums;

public enum PropTypes {

    MOBILE("mobile"),
    WEB("web"),
    CONFIG("config"),
    REPORT("report"),
    API("api");

    private final String value;

    PropTypes(String value) {
        this.value = value;
    }

    public String value() {
        return value;
    }

}
