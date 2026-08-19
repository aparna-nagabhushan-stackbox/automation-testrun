package pageobjects.web;

import framework.commons.Generics;
import org.openqa.selenium.WebDriver;
import org.openqa.selenium.WebElement;
import org.openqa.selenium.support.FindBy;
import org.openqa.selenium.support.PageFactory;
import org.openqa.selenium.support.ui.ExpectedConditions;
import org.openqa.selenium.support.ui.WebDriverWait;

import java.time.Duration;

public class HomeWebPO extends Generics {

    WebDriver webDriver;
    WebDriverWait wait;

    public HomeWebPO(WebDriver webDriver) {
        this.webDriver = webDriver;
        PageFactory.initElements(this.webDriver, this);
        wait = new WebDriverWait(webDriver, Duration.ofSeconds(EXPLICIT_WAIT));
    }

    // TODO-LOCATOR: verify against live app — element that only appears once login succeeds
    // (e.g. a dashboard header, user avatar, or nav sidebar item on the post-login home screen)
    @FindBy(id = "profile")
    public WebElement lblLoggedInIndicator;

    // TODO-LOCATOR: verify against live app — the nav/tile that opens the WMS module from Home
    @FindBy(xpath = "//*[text()='WMS']")
    public WebElement navWMS;

    // TODO-LOCATOR: verify against live app — branch selector dropdown/button on Home
    @FindBy(id = "branch-selector")
    public WebElement ddBranchSelector;

    // TODO-LOCATOR: verify against live app — branch option list item, {branch} is a placeholder
    // for the branch name passed into selectBranch(); adjust the xpath template to match the real
    // dropdown's option markup once available
    public boolean isLoggedIn() {
        testVerifyLog("Verify user is logged in to Home");
        return isElementPresent(lblLoggedInIndicator);
    }

    public void openWMS() {
        wait.until(ExpectedConditions.elementToBeClickable(navWMS));
        testStepsLog("Click on WMS navigation");
        clickOn(webDriver, navWMS);
    }

    public void selectBranch(String branchName) {
        testStepsLog("Open branch selector");
        clickOn(webDriver, ddBranchSelector);
        testInfoLog("Select Branch", branchName);
        // TODO-LOCATOR: verify against live app — replace with the real option locator for branchName
        WebElement branchOption = webDriver.findElement(
                org.openqa.selenium.By.xpath("//*[text()='" + branchName + "']"));
        clickOn(webDriver, branchOption);
    }
}
