package framework.init;

import framework.commons.Generics;
import framework.configurations.Configuration;
import org.testng.ITestContext;
import org.testng.ITestResult;
import org.testng.annotations.AfterMethod;
import org.testng.annotations.BeforeMethod;

public class HelperInit extends Generics implements Configuration {

    private static final ThreadLocal<String> suiteNameThread = ThreadLocal.withInitial(() -> "");
    private static final ThreadLocal<String> methodNameThread = ThreadLocal.withInitial(() -> "");

    public static String getSuiteName() {
        return suiteNameThread.get();
    }

    public static String getMethodName() {
        return methodNameThread.get();
    }

    @BeforeMethod(alwaysRun = true)
    public void initHelper(ITestContext testContext, ITestResult result) throws Exception {
        suiteNameThread.set(testContext.getCurrentXmlTest().getSuite().getName());
        methodNameThread.set(result.getMethod().getMethodName());
    }

    @AfterMethod(alwaysRun = true)
    public void stopHelpers() throws Exception {
        suiteNameThread.remove();
        methodNameThread.remove();
    }

}
