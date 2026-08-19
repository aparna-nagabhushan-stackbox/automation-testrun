package framework.commons;

import framework.configurations.Configuration;
import org.openqa.selenium.*;
import org.openqa.selenium.interactions.Actions;
import org.openqa.selenium.support.ui.ExpectedConditions;
import org.openqa.selenium.support.ui.WebDriverWait;

import java.time.Duration;
import java.util.List;

public class ElementActions extends AppActions implements Configuration {

    public static void type(WebDriver driver, WebElement webElement, String value, Boolean isBeforeClick) {
        if (isBeforeClick) clickOn(driver, webElement);
        sendKeys(webElement, value);
    }

    public static void typeSlow(WebElement webElement, String value) {
        clear(webElement);
        for (int index = 0; index < value.length(); index++) {
            if (index == 0) sendKeys(webElement, "X");
            sendKeys(webElement, String.valueOf(value.charAt(index)));
        }
    }

    public static void sendKeys(WebElement webElement, String value) {
        webElement.sendKeys(value);
    }

    public static void clickOn(WebDriver driver, WebElement element) {
        element.click();
    }

    public static void doubleClickOn(WebDriver driver, WebElement element) {
        try {
            Actions actions = new Actions(driver);
            actions.doubleClick(element).build().perform();
        } catch (ElementClickInterceptedException ignore) {

        }
    }

    public static void clear(WebElement webElement) {
        webElement.clear();
    }

    public void clearFieldByBackspace(WebElement webElement) {
        webElement.sendKeys(Keys.CONTROL + "a");
        webElement.sendKeys(Keys.BACK_SPACE);
    }

    public void clickEscape(WebElement webElement) {
        webElement.sendKeys(Keys.ESCAPE);
    }

    public void clearFieldSendKeys(WebElement webElement, String value) {
        webElement.sendKeys(Keys.CONTROL + "a");
        webElement.sendKeys(value);
    }

    public static void clickByJS(WebDriver driver, WebElement element) {
        WebDriverWait wait = new WebDriverWait(driver, Duration.ofSeconds(EXPLICIT_WAIT));
        wait.until(ExpectedConditions.elementToBeClickable(element));
        JavascriptExecutor executor = (JavascriptExecutor) driver;
        executor.executeScript("arguments[0].click();", element);
    }

    public static String getText(WebElement element) {
        return element.getText().trim();
    }

    public static String getValue(WebElement element) {
        return element.getAttribute("value").trim();
    }

    public static String getInnerText(WebElement element) {
        return element.getAttribute("innerText").trim();
    }

    public static String getTextByJS(WebDriver driver, WebElement element) {
        return ((JavascriptExecutor) driver).executeScript("return $(arguments[0]).text();", element).toString();
    }

    public static boolean isElementDisplay(WebElement element) {
        return element.isDisplayed();
    }

    public static boolean isElementPresent(WebElement element) {
        try {
            return element.isDisplayed();
        } catch (NoSuchElementException nse) {
            return false;
        }
    }

    public boolean isElementEnabled(WebElement element) {
        try {
            return element.isEnabled();
        } catch (Exception e) {
            return false;
        }
    }

    public static boolean isElementPresent(WebDriver driver, String locator) {
        try {
            return driver.findElement(By.xpath(locator)).isDisplayed();
        } catch (NoSuchElementException nse) {
            return false;
        }
    }

    public static void hoverAndClick(WebDriver driver, WebElement element) {
        Actions actions = new Actions(driver);
        actions.moveToElement(element).click().perform();
    }

    public static void clickByCoordinates(WebDriver driver, int xOffset, int yOffset) {
        Actions actions = new Actions(driver);
        actions.moveByOffset(xOffset, yOffset).click().perform();
    }

    public static void moveToElement(WebDriver driver, WebElement element, int x, int y) {
        Actions actions = new Actions(driver);
        actions.moveToElement(element, x, y).click().perform();
    }

    public static void moveToElement(WebDriver driver, WebElement element) {
        Actions actions = new Actions(driver);
        actions.moveToElement(element).perform();
    }

    public static void navigateBack(WebDriver driver) {
        try {
            driver.navigate().back();
        } catch (Exception e) {
            throw new RuntimeException(e);
        }
    }

    public static boolean isElementNotPresent(WebElement element) {
        try {
            return !element.isDisplayed();
        } catch (NoSuchElementException nse) {
            return true;
        }
    }

    public static String getCellTextByHeader(WebDriver driver, By tableLocator, String headerName, int rowIndex) {
        WebElement table = driver.findElement(tableLocator);
        List<WebElement> headers = table.findElements(By.xpath(".//tr[1]/th"));
        int targetColumnIndex = -1;
        for (int i = 0; i < headers.size(); i++) {
            String headerText = headers.get(i).getText().trim();
            if (headerText.equalsIgnoreCase(headerName)) {
                targetColumnIndex = i + 1;
                break;
            }
        }
        if (targetColumnIndex == -1) {
            throw new RuntimeException("Column with header '" + headerName + "' not found");
        }
        String cellXpath = ".//tr[" + (rowIndex + 1) + "]/td[" + targetColumnIndex + "]";
        WebElement cell = table.findElement(By.xpath(cellXpath));
        return cell.getText().trim();
    }

    public static int getHeaderColumnIndex(WebDriver driver, String headerName) {
        WebElement table = driver.findElement(By.xpath("//table"));
        List<WebElement> headers = table.findElements(By.xpath(".//tr[1]/th"));
        for (int i = 0; i < headers.size(); i++) {
            String headerText = headers.get(i).getText().trim();
            if (headerText.equalsIgnoreCase(headerName)) {
                return i + 1;
            }
        }
        throw new RuntimeException("Column with header '" + headerName + "' not found");
    }

}
