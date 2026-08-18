package framework.commons;

import framework.configurations.Configuration;
import io.restassured.response.Response;
import io.restassured.specification.RequestSpecification;

import java.util.List;
import java.util.Map;

import static framework.commons.Generics.pause;
import static io.restassured.RestAssured.given;

/**
 * Thin REST-Assured wrappers used by every api.builder.*Builder class.
 * Every call is followed by a fixed pause(1) instead of a retry/backoff strategy —
 * keep that pattern when adding new overloads so builders stay consistent.
 */
public class APIActions extends AppiumServices implements Configuration {

    public static Response get(String baseUrl, String url, Map<String, Object> headers, Map<String, Object> params, boolean... forceFailure) {

        Response response = given().baseUri(baseUrl)
                .noContentType()
                .headers(headers)
                .queryParams(params)
                .when()
                .get(url)
                .then()
                .extract().response();

        if (forceFailure.length > 0 && forceFailure[0]) {
            if (response.getStatusCode() != 200)
                throw new APIException(baseUrl, url, headers, response.getStatusCode(), response.body().prettyPrint());
        }

        pause(1);

        return response;
    }

    public static Response get(String baseUrl, String url, Map<String, Object> headers, boolean... forceFailure) {

        Response response = given().baseUri(baseUrl)
                .noContentType()
                .headers(headers)
                .when()
                .get(url)
                .then()
                .extract().response();

        if (forceFailure.length > 0 && forceFailure[0]) {
            if (response.getStatusCode() != 200)
                throw new APIException(baseUrl, url, headers, response.getStatusCode(), response.body().prettyPrint());
        }

        pause(1);

        return response;
    }

    public static Response get(String url, Map<String, Object> headers, boolean... forceFailure) {

        Response response = given().baseUri(API_URL)
                .noContentType()
                .headers(headers)
                .when()
                .get(url)
                .then()
                .extract().response();

        if (forceFailure.length > 0 && forceFailure[0]) {
            if (response.getStatusCode() != 200)
                throw new APIException(url, headers, response.getStatusCode(), response.body().prettyPrint());
        }

        pause(1);

        return response;
    }

    public static Response post(String baseUrl, String url, Map<String, Object> headers, Map<String, Object> body, boolean... forceFailure) {

        RequestSpecification request = given()
                .baseUri(baseUrl)
                .headers(headers)
                .body(body);

        if (headers != null && headers.containsKey("content-type")) {
            String contentType = String.valueOf(headers.get("content-type"));
            request.contentType(contentType);
            headers.remove("content-type");
        } else {
            request.noContentType();
        }

        if (headers != null)
            headers.forEach((k, v) -> request.header(k, String.valueOf(v)));

        Response response = request
                .when()
                .post(url)
                .then()
                .extract().response();

        if (forceFailure.length > 0 && forceFailure[0]) {
            if (response.getStatusCode() != 200)
                throw new APIException(baseUrl, url, headers, body, response.getStatusCode(), response.body().prettyPrint());
        }

        pause(1);

        return response;
    }

    public static Response get(String url, Map<String, Object> headers, Map<String, Object> params, boolean... forceFailure) {

        Response response = given().baseUri(API_URL)
                .noContentType()
                .headers(headers)
                .queryParams(params)
                .when()
                .get(url)
                .then()
                .extract().response();

        if (forceFailure.length > 0 && forceFailure[0]) {
            if (response.getStatusCode() != 200)
                throw new APIException(url, headers, response.getStatusCode(), response.body().prettyPrint());
        }

        pause(1);

        return response;

    }

    public static Response post(String url, Map<String, Object> headers, Map<String, Object> params, String body, boolean... forceFailure) {

        RequestSpecification request = given()
                .baseUri(API_URL)
                .headers(headers)
                .queryParams(params)
                .body(body);

        if (headers != null && headers.containsKey("content-type")) {
            String contentType = String.valueOf(headers.get("content-type"));
            request.contentType(contentType);
            headers.remove("content-type");
        } else {
            request.noContentType();
        }

        if (headers != null)
            headers.forEach((k, v) -> request.header(k, String.valueOf(v)));

        Response response = request
                .when()
                .post(url)
                .then()
                .extract().response();

        if (forceFailure.length > 0 && forceFailure[0]) {
            if (response.getStatusCode() != 200)
                throw new APIException(url, headers, body, response.getStatusCode(), response.body().prettyPrint());
        }

        pause(1);

        return response;

    }

    public static Response post(String url, Map<String, Object> headers, Map<String, Object> params, Map<String, Object> body, boolean... forceFailure) {

        RequestSpecification request = given()
                .baseUri(API_URL)
                .headers(headers)
                .queryParams(params)
                .body(body);

        if (headers != null && headers.containsKey("content-type")) {
            String contentType = String.valueOf(headers.get("content-type"));
            request.contentType(contentType);
            headers.remove("content-type");
        } else {
            request.noContentType();
        }

        if (headers != null)
            headers.forEach((k, v) -> request.header(k, String.valueOf(v)));

        Response response = request
                .when()
                .post(url)
                .then()
                .extract().response();

        if (forceFailure.length > 0 && forceFailure[0]) {
            if (response.getStatusCode() != 200)
                throw new APIException(url, headers, body, response.getStatusCode(), response.body().prettyPrint());
        }

        pause(1);

        return response;
    }

    public static Response post(String url, Map<String, Object> headers, Map<String, Object> params, List<Map<String, Object>> body, boolean... forceFailure) {

        RequestSpecification request = given()
                .baseUri(API_URL)
                .headers(headers)
                .queryParams(params)
                .body(body);

        if (headers != null && headers.containsKey("content-type")) {
            String contentType = String.valueOf(headers.get("content-type"));
            request.contentType(contentType);
            headers.remove("content-type");
        } else {
            request.noContentType();
        }

        if (headers != null)
            headers.forEach((k, v) -> request.header(k, String.valueOf(v)));

        Response response = request
                .when()
                .post(url)
                .then()
                .extract().response();

        if (forceFailure.length > 0 && forceFailure[0]) {
            if (response.getStatusCode() != 200)
                throw new APIException(url, headers, body, response.getStatusCode(), response.body().prettyPrint());
        }

        pause(1);

        return response;
    }

    public static Response delete(String url, Map<String, Object> headers, Map<String, Object> params, boolean... forceFailure) {

        Response response = given().baseUri(API_URL)
                .headers(headers)
                .noContentType()
                .queryParams(params)
                .when()
                .delete(url)
                .then()
                .extract().response();

        if (forceFailure.length > 0 && forceFailure[0]) {
            if (response.getStatusCode() != 200)
                throw new APIException(url, headers, response.getStatusCode(), response.body().prettyPrint());
        }

        pause(1);

        return response;

    }

    public static Response delete(String url, Map<String, Object> headers, Map<String, Object> params, Map<String, Object> body, boolean... forceFailure) {

        Response response = given().baseUri(API_URL)
                .headers(headers)
                .queryParams(params)
                .body(body)
                .when()
                .delete(url)
                .then()
                .extract().response();

        if (forceFailure.length > 0 && forceFailure[0]) {
            if (response.getStatusCode() != 200)
                throw new APIException(url, headers, response.getStatusCode(), response.body().prettyPrint());
        }

        pause(1);

        return response;
    }

    public static Response post(String url, Map<String, Object> headers, boolean... forceFailure) {

        RequestSpecification request = given()
                .baseUri(API_URL)
                .headers(headers);

        request.noContentType();

        Response response = request
                .when()
                .post(url)
                .then()
                .extract().response();

        if (forceFailure.length > 0 && forceFailure[0]) {
            if (response.getStatusCode() != 200)
                throw new APIException(url, headers, response.getStatusCode(), response.body().prettyPrint());
        }

        pause(1);

        return response;

    }

    public static Response post(String url, Map<String, Object> headers, Map<String, Object> queryParams, boolean... forceFailure) {

        RequestSpecification request = given()
                .baseUri(API_URL)
                .headers(headers)
                .queryParams(queryParams);

        request.noContentType();

        Response response = request
                .when()
                .post(url)
                .then()
                .extract().response();

        if (forceFailure.length > 0 && forceFailure[0]) {
            if (response.getStatusCode() != 200)
                throw new APIException(url, headers, response.getStatusCode(), response.body().prettyPrint());
        }

        pause(1);

        return response;

    }

}
