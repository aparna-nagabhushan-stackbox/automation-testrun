package framework.commons;

import com.github.javafaker.Faker;
import org.apache.commons.lang3.RandomStringUtils;

import java.util.List;
import java.util.Locale;
import java.util.concurrent.ThreadLocalRandom;

public class Random extends Scroller {

    private static final Faker faker = new Faker(new Locale("en-US"));

    public static String getRandomCityName() {
        return faker.address().cityName();
    }

    public static String getRandomCharacters(int length) {
        return RandomStringUtils.randomAlphabetic(length);
    }

    public static String getRandomVehicleNumber() {
        return RandomStringUtils.randomAlphabetic(2).toUpperCase()
                + getRandomNumberBetween(10, 99) +
                RandomStringUtils.randomAlphabetic(2).toUpperCase()
                + getRandomNumberBetween(10000, 99999);
    }

    public static String getRandomLRNumber() {
        return RandomStringUtils.randomAlphabetic(5).toUpperCase()
                + getRandomNumberBetween(10000, 99999);
    }

    public static String getInvalidEmail() {
        return getRandomFirstName().toLowerCase() + "." + getRandomLastName().toLowerCase() + "testmail.com";
    }

    public static String getRegistrationEmail() {
        return "auto_test_" + System.currentTimeMillis() + "@mailinator.com";
    }

    public static String getRandomValidEmail() {
        return "demo_test" + getRandomNumberBetween(1, 10) + "@mail.com";
    }

    public static String getRandomFirstName() {
        return faker.name().firstName().replaceAll("'", "");
    }

    public static String getRandomLastName() {
        return faker.name().lastName().replaceAll("'", "");
    }

    public static String getRandomGender() {
        String[] gender = {"Male", "Female", "Unknown", "X"};
        return gender[getRandomNumberBetween(0, gender.length - 1)];
    }

    public static String getFullName() {
        return getRandomFirstName() + " " + getRandomLastName();
    }

    public static String getRandomStreetName() {
        return faker.address().streetName();
    }

    public static boolean getRandomBoolean() {
        return Math.random() < 0.5;
    }

    public static String getRandomPassword() {
        return getRandomCharacters(3).toLowerCase() + getRandomCharacters(2).toUpperCase() + "@" + getRandomNumber();
    }

    public static long getRandomNumber() {
        return faker.number().numberBetween(10000, 99999);
    }

    public static long getRandomMobileNumber(int... number) {
        return number.length == 0 ?
                Long.parseLong(getRandomNumber() + "" + getRandomNumber()) :
                Long.parseLong(getRandomNumber() + "" + getRandomNumber() + getRandomNumberBetween(0, 9));
    }

    public static int getRandomNumberBetween(int min, int max) {
        return faker.number().numberBetween(min, max);
    }

    public static double getRandomNumberDouble(int min, int max) {
        return faker.number().randomDouble(5, min, max);
    }

    public static int getRandomIndex(List<?> list) {
        if (list == null || list.isEmpty()) {
            throw new IllegalArgumentException("List must not be null or empty");
        }
        return ThreadLocalRandom.current().nextInt(list.size());
    }

}
