package tests;

import constants.DataKeys;
import framework.annotations.Web;
import framework.listeners.DriverInit;
import framework.utils.TestDataLoader;
import org.testng.Assert;
import org.testng.annotations.Test;
import pageobjects.web.HomeWebPO;
import pageobjects.web.LoginWebPO;
import pageobjects.web.WMSWebPO;

import java.util.Map;

public class LoginTests extends DriverInit {

    @Web
    @Test
    public void TC_001_WMS_WEB_LOGIN() {

        LoginWebPO loginWebPO = new LoginWebPO(getWebDriver());
        HomeWebPO homeWebPO = new HomeWebPO(getWebDriver());
        WMSWebPO wmsWebPO = new WMSWebPO(getWebDriver());

        loginWebPO.loginAs(USERNAME, PASSWORD);
        Assert.assertTrue(homeWebPO.isLoggedIn());

        homeWebPO.openWMS();
        Assert.assertTrue(wmsWebPO.isWMSOverAllPageLoaded());
    }

    @Web
    @Test
    public void TC_002_WMS_BRANCH_SWITCH() {

        Map<String, String> data = TestDataLoader.getTestData("login", "TC_002");

        LoginWebPO loginWebPO = new LoginWebPO(getWebDriver());
        HomeWebPO homeWebPO = new HomeWebPO(getWebDriver());

        loginWebPO.loginAs(USERNAME, PASSWORD);
        Assert.assertTrue(homeWebPO.isLoggedIn());

        homeWebPO.selectBranch(data.get(DataKeys.BRANCH_NAME));
    }
}
