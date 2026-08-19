package pageobjects.web;

import framework.commons.Generics;
import org.openqa.selenium.WebDriver;
import org.openqa.selenium.WebElement;
import org.openqa.selenium.support.FindBy;
import org.openqa.selenium.support.PageFactory;
import org.openqa.selenium.support.ui.ExpectedConditions;
import org.openqa.selenium.support.ui.WebDriverWait;

import java.time.Duration;

public class WMSWebPO extends Generics {

    WebDriver webDriver;
    WebDriverWait wait;

    public WMSWebPO(WebDriver webDriver) {
        this.webDriver = webDriver;
        PageFactory.initElements(this.webDriver, this);
        wait = new WebDriverWait(webDriver, Duration.ofSeconds(EXPLICIT_WAIT));
    }

    // TODO-LOCATOR: verify against live app — an element unique to the WMS overview/landing page
    @FindBy(xpath = "//*[contains(text(),'WMS')]")
    public WebElement lblWMSOverallPage;

    // TODO-LOCATOR: verify against live app — the node/branch ID label shown once WMS is loaded
    @FindBy(id = "node-id")
    public WebElement lblNodeId;

    public boolean isWMSOverAllPageLoaded() {
        wait.until(ExpectedConditions.visibilityOf(lblWMSOverallPage));
        testVerifyLog("Verify WMS overall page is loaded");
        return isElementPresent(lblWMSOverallPage);
    }

    public boolean isNodeIdVisible() {
        testVerifyLog("Verify Node ID is visible");
        return isElementPresent(lblNodeId);
    }
}
