package framework.commons;

import framework.enums.Direction;
import io.appium.java_client.AppiumBy;
import io.appium.java_client.android.AndroidDriver;
import org.openqa.selenium.Dimension;
import org.openqa.selenium.JavascriptExecutor;
import org.openqa.selenium.WebDriver;
import org.openqa.selenium.WebElement;
import org.openqa.selenium.interactions.*;

import java.time.Duration;
import java.util.Arrays;
import java.util.Collections;

public class Scroller extends TestActions {

    public static void scrollToElement(WebDriver driver, WebElement element) {
        Actions actions = new Actions(driver);
        actions.moveToElement(element);
        actions.perform();
    }

    public static void scrollToElementJS(WebDriver driver, WebElement element) {
        JavascriptExecutor js = (JavascriptExecutor) driver;
        js.executeScript("arguments[0].scrollIntoView(true);", element);
    }

    public static void scrollElement(WebElement element) {
        Coordinates cor = ((Locatable) element).getCoordinates();
        cor.inViewPort();
    }

    public static void scrollToTop(WebDriver driver) {
        JavascriptExecutor js = (JavascriptExecutor) driver;
        js.executeScript("window.scrollTo(0, 0);");
    }

    public static void scrollByOffset(WebDriver driver, int xOffset, int yOffset) {
        JavascriptExecutor js = (JavascriptExecutor) driver;
        js.executeScript("window.scrollBy(arguments[0], arguments[1]);", xOffset, yOffset);
    }

    public static void scrollOnce(AndroidDriver driver, Direction direction) {

        String uiScrollable;

        switch (direction) {
            case UP:
                uiScrollable =
                        "new UiScrollable(new UiSelector().scrollable(true)).scrollBackward()";
                break;

            case DOWN:
                uiScrollable =
                        "new UiScrollable(new UiSelector().scrollable(true)).scrollForward()";
                break;

            default:
                throw new IllegalArgumentException("Invalid scroll direction: " + direction);
        }
        driver.findElement(AppiumBy.androidUIAutomator(uiScrollable));
    }

    public void swipe(AndroidDriver driver, Direction direction) {
        Dimension dimension = driver.manage().window().getSize();
        int width = dimension.getWidth();
        int height = dimension.getHeight();

        int startX = 0, startY = 0, endX = 0, endY = 0;

        switch (direction) {
            case UP:
                startX = width / 2;
                startY = (int) (height * 0.2);
                endX = width / 2;
                endY = (int) (height * 0.8);
                break;
            case DOWN:
                startX = width / 2;
                startY = (int) (height * 0.8);
                endX = width / 2;
                endY = (int) (height * 0.2);
                break;
            case LEFT:
                startX = (int) (width * 0.9);
                startY = height / 2;
                endX = (int) (width * 0.1);
                endY = height / 2;
                break;
            case RIGHT:
                startX = (int) (width * 0.1);
                startY = height / 2;
                endX = (int) (width * 0.9);
                endY = height / 2;
                break;
        }

        PointerInput finger = new PointerInput(PointerInput.Kind.TOUCH, "finger");
        Sequence swipe = new Sequence(finger, 0);
        swipe.addAction(finger.createPointerMove(Duration.ZERO, PointerInput.Origin.viewport(), startX, startY));
        swipe.addAction(finger.createPointerDown(PointerInput.MouseButton.LEFT.asArg()));
        swipe.addAction(finger.createPointerMove(Duration.ofMillis(1000), PointerInput.Origin.viewport(), endX, endY));
        swipe.addAction(finger.createPointerUp(PointerInput.MouseButton.LEFT.asArg()));

        driver.perform(Collections.singletonList(swipe));
    }

    public void swipeElement(AndroidDriver driver, WebElement element, Direction direction) {
        int startX = element.getLocation().getX();
        int startY = element.getLocation().getY();
        int width = element.getSize().getWidth();
        int height = element.getSize().getHeight();

        int endX = startX;
        int endY = startY;

        switch (direction) {
            case UP:
                endY = startY - (height / 2);
                break;
            case DOWN:
                endY = startY + (height / 2);
                break;
            case LEFT:
                endX = (int) (startX - (width / 1.5));
                break;
            case RIGHT:
                endX = (int) (startX + (width / 1.5));
                break;
        }

        PointerInput finger = new PointerInput(PointerInput.Kind.TOUCH, "finger");
        Sequence swipe = new Sequence(finger, 0);
        swipe.addAction(finger.createPointerMove(Duration.ZERO, PointerInput.Origin.viewport(), startX + width / 2, startY + height / 2));
        swipe.addAction(finger.createPointerDown(PointerInput.MouseButton.LEFT.asArg()));
        swipe.addAction(finger.createPointerMove(Duration.ofMillis(1000), PointerInput.Origin.viewport(), endX, endY));
        swipe.addAction(finger.createPointerUp(PointerInput.MouseButton.LEFT.asArg()));

        driver.perform(Collections.singletonList(swipe));
    }

    public void swipe(AndroidDriver driver, double startXPercent, double startYPercent, double endXPercent, double endYPercent) {

        Dimension dimension = driver.manage().window().getSize();
        int width = dimension.getWidth();
        int height = dimension.getHeight();

        int startX = (int) Math.round(width * startXPercent);
        int startY = (int) Math.round(height * startYPercent);
        int endX = (int) Math.round(width * endXPercent);
        int endY = (int) Math.round(height * endYPercent);

        PointerInput finger = new PointerInput(PointerInput.Kind.TOUCH, "finger");
        Sequence swipe = new Sequence(finger, 0);

        swipe.addAction(finger.createPointerMove(Duration.ZERO, PointerInput.Origin.viewport(), startX, startY));
        swipe.addAction(finger.createPointerDown(PointerInput.MouseButton.LEFT.asArg()));
        swipe.addAction(finger.createPointerMove(Duration.ofMillis(1000), PointerInput.Origin.viewport(), endX, endY));
        swipe.addAction(finger.createPointerUp(PointerInput.MouseButton.LEFT.asArg()));

        driver.perform(Collections.singletonList(swipe));
    }

}
