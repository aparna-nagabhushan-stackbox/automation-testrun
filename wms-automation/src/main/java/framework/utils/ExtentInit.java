package framework.utils;

import com.aventstack.extentreports.AnalysisStrategy;
import com.aventstack.extentreports.ExtentReports;
import com.aventstack.extentreports.ExtentTest;
import com.aventstack.extentreports.reporter.ExtentSparkReporter;
import com.aventstack.extentreports.reporter.configuration.Theme;
import framework.configurations.Configuration;
import framework.configurations.DateTimeFormat;

import java.io.File;
import java.time.LocalDate;
import java.time.LocalTime;
import java.time.format.DateTimeFormatter;

public class ExtentInit implements Configuration {

    public static String REPORT_PATH;
    public static String FOLDER_PATH;
    protected static ExtentReports extent;

    private static final ThreadLocal<ExtentTest> loggerThread = new ThreadLocal<>();

    protected static ExtentTest getExtentLogger() {
        return loggerThread.get();
    }

    protected static void setExtentLogger(ExtentTest test) {
        loggerThread.set(test);
    }

    protected static void removeExtentLogger() {
        loggerThread.remove();
    }

    public static void initializeReport(String suiteName) {

        File directory = new File(PROJECT_DIR + File.separator + "ExtentReports");
        if (!directory.exists()) directory.mkdir();

        String dateDir = PROJECT_DIR + File.separator + "ExtentReports" + File.separator +
                LocalDate.now().format(DateTimeFormatter.ofPattern(DateTimeFormat.DATE_FORMAT_DASH_DD_MMM_YYYY));
        File dateDirectory = new File(dateDir);
        if (!dateDirectory.exists()) dateDirectory.mkdir();

        String timeDir = PROJECT_DIR + File.separator + "ExtentReports" + File.separator +
                LocalDate.now().format(DateTimeFormatter.ofPattern(DateTimeFormat.DATE_FORMAT_DASH_DD_MMM_YYYY)) +
                File.separator + LocalTime.now().format(DateTimeFormatter.ofPattern(DateTimeFormat.TIME_FORMAT_US_HH_MM_SS));
        File timeDirectory = new File(timeDir);
        if (!timeDirectory.exists()) timeDirectory.mkdir();

        REPORT_PATH = timeDir;
        FOLDER_PATH = dateDir;

        ExtentSparkReporter htmlReporter =
                new ExtentSparkReporter(timeDir + File.separator + "Report_" + suiteName + ".html");

        extent = new ExtentReports();
        extent.attachReporter(htmlReporter);

        extent.setSystemInfo("OS", System.getProperty("os.name"));
        extent.setSystemInfo("OS Architecture", System.getProperty("os.arch"));
        extent.setSystemInfo("Java Version", System.getProperty("java.version"));
        extent.setSystemInfo("User Name", System.getProperty("user.name"));

        extent.setAnalysisStrategy(AnalysisStrategy.TEST);

        htmlReporter.config().setTheme(Theme.STANDARD);
        htmlReporter.config().setEncoding("utf-8");
        htmlReporter.config().setDocumentTitle("Automation Test Report");
        htmlReporter.config().setReportName("Automation Test Report");
    }

    public static void flushReport() {
        extent.flush();
    }

}
