package framework.commons;

import java.util.List;
import java.util.Map;

public class APIException extends RuntimeException {
    public APIException(String message) {
        super(message);
    }

    public APIException(String message, int code, String body) {
        super("API DETAILS : " + message + "\n" +
                "STATUS CODE : " + code + "\n" +
                "RESPONSE BODY : " + body);
    }

    public APIException(String baseUrl, String url, Map<String, Object> headers, Map<String, Object> body, int statusCode, String response) {
        super("ERROR WHILE CALLING API WITH BELOW DETAILS\n" +
                "REQUEST URL : " + baseUrl + url + "\n" +
                "HEADERS : " + headers + "\n" +
                "REQUEST BODY : " + body + "\n" +
                "STATUS CODE : " + statusCode + "\n" +
                "RESPONSE BODY : " + response);
    }

    public APIException(String baseUrl, String url, Map<String, Object> headers, int statusCode, String response) {
        super("ERROR WHILE CALLING API WITH BELOW DETAILS\n" +
                "REQUEST URL : " + baseUrl + url + "\n" +
                "HEADERS : " + headers + "\n" +
                "STATUS CODE : " + statusCode + "\n" +
                "RESPONSE BODY : " + response);
    }

    public APIException(String url, Map<String, Object> headers, int statusCode, String response) {
        super("ERROR WHILE CALLING API WITH BELOW DETAILS\n" +
                "REQUEST URL : " + url + "\n" +
                "HEADERS : " + headers + "\n" +
                "STATUS CODE : " + statusCode + "\n" +
                "RESPONSE BODY : " + response);
    }

    public APIException(String url, Map<String, Object> headers, Map<String, Object> body, int statusCode, String response) {
        super("ERROR WHILE CALLING API WITH BELOW DETAILS\n" +
                "REQUEST URL : " + url + "\n" +
                "HEADERS : " + headers + "\n" +
                "REQUEST BODY : " + body + "\n" +
                "STATUS CODE : " + statusCode + "\n" +
                "RESPONSE BODY : " + response);
    }

    public APIException(String url, Map<String, Object> headers, String body, int statusCode, String response) {
        super("ERROR WHILE CALLING API WITH BELOW DETAILS\n" +
                "REQUEST URL : " + url + "\n" +
                "HEADERS : " + headers + "\n" +
                "REQUEST BODY : " + body + "\n" +
                "STATUS CODE : " + statusCode + "\n" +
                "RESPONSE BODY : " + response);
    }

    public APIException(String url, Map<String, Object> headers, List<Map<String, Object>> body, int statusCode, String response) {
        super("ERROR WHILE CALLING API WITH BELOW DETAILS\n" +
                "REQUEST URL : " + url + "\n" +
                "HEADERS : " + headers + "\n" +
                "REQUEST BODY : " + body + "\n" +
                "STATUS CODE : " + statusCode + "\n" +
                "RESPONSE BODY : " + response);
    }
}
