package pageobjects.web;

import framework.commons.Generics;
import org.openqa.selenium.WebDriver;
import org.openqa.selenium.WebElement;
import org.openqa.selenium.support.FindBy;
import org.openqa.selenium.support.PageFactory;
import org.openqa.selenium.support.ui.ExpectedConditions;
import org.openqa.selenium.support.ui.WebDriverWait;

import java.time.Duration;

public class LoginWebPO extends Generics {

    WebDriver webDriver;
    WebDriverWait wait;

    public LoginWebPO(WebDriver webDriver) {
        this.webDriver = webDriver;
        PageFactory.initElements(this.webDriver, this);
        wait = new WebDriverWait(webDriver, Duration.ofSeconds(EXPLICIT_WAIT));
    }

    @FindBy(id = "user-name-input")
    public WebElement txtUsername;

    @FindBy(id = "user-password-input")
    public WebElement txtPassword;

    @FindBy(id = "main-login-button")
    public WebElement btnLogin;

    @FindBy(id = "profile")
    public WebElement btnProfile;

    @FindBy(id = "logout")
    public WebElement btnLogout;

    public void loginAs(String username, String password) {
        wait.until(ExpectedConditions.visibilityOf(txtUsername));
        testStepsLog("Enter Login Credentials");
        testInfoLog("Enter Email", username);
        type(webDriver, txtUsername, username, true);
        testInfoLog("Enter Password", password);
        type(webDriver, txtPassword, password, true);
        testStepsLog("Click on Login Button");
        clickOn(webDriver, btnLogin);
    }

    public void clickOnLogout() {
        testStepsLog("Click on Profile icon");
        clickOn(webDriver, btnProfile);
        testStepsLog("Click on Logout button");
        clickOn(webDriver, btnLogout);
    }

    public boolean isLoginScreenVisible() {
        wait.until(ExpectedConditions.visibilityOf(txtUsername));
        testVerifyLog("Verify Login screen display");
        return isElementPresent(txtUsername) && isElementPresent(txtPassword);
    }

    public boolean isLoginURLLoaded() {
        return webDriver.getCurrentUrl().contains("/login");
    }
}
