package app.homeport.api.board.templates;

import app.homeport.api.board.Fields;
import app.homeport.api.board.Scene;
import app.homeport.api.board.Template;
import app.homeport.api.board.Words;
import app.homeport.api.common.ApiProblem;
import app.homeport.api.home.TodaySource.TodayCard;
import app.homeport.api.thing.ThingKind;
import java.time.Instant;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.time.format.DateTimeParseException;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.Locale;
import org.springframework.http.HttpStatus;

/** The few ready-made words and small helpers the fair-and-fun and the couple's templates share. */
final class Phrases {

    private static final DateTimeFormatter WEEKDAY = DateTimeFormatter.ofPattern("EEEE", Locale.ENGLISH);
    private static final DateTimeFormatter MONTH = DateTimeFormatter.ofPattern("MMMM", Locale.ENGLISH);

    private Phrases() {}

    /** Monday */
    static String weekday(LocalDate day) {
        return WEEKDAY.format(day);
    }

    /** October */
    static String month(LocalDate day) {
        return MONTH.format(day);
    }

    /** "Monday", "Monday and Tuesday", "Monday, Tuesday and Friday" */
    static String list(List<String> words) {
        if (words.size() <= 1) {
            return words.isEmpty() ? "" : words.get(0);
        }
        return String.join(", ", words.subList(0, words.size() - 1)) + " and " + words.get(words.size() - 1);
    }

    /**
     * A day in the past as people say it, seen from today: "today", "yesterday", "on Monday" for a day earlier
     * this week, "last Friday" for one in the week before, "on 14 Sep" for anything older.
     */
    static String ago(LocalDate day, LocalDate today) {
        long days = ChronoUnit.DAYS.between(day, today);
        if (days <= 0) {
            return "today";
        }
        if (days == 1) {
            return "yesterday";
        }
        if (!day.isBefore(MealPlan.monday(today))) {
            return "on " + weekday(day);
        }
        if (!day.isBefore(MealPlan.monday(today).minusDays(7))) {
            return "last " + weekday(day);
        }
        return "on " + Words.shortDay(day);
    }

    /** "Friday" for a day in the coming week, "tonight" for today, "27 Nov" for one further off. */
    static String coming(LocalDate day, LocalDate today) {
        long days = ChronoUnit.DAYS.between(today, day);
        if (days == 0) {
            return "Tonight";
        }
        return days > 0 && days < 7 ? weekday(day) : Words.shortDay(day);
    }

    /** A moment the app sent as text ("2026-11-13T19:00:00Z"), or null when it sent none. */
    static Instant instant(String text) {
        if (text == null) {
            return null;
        }
        try {
            return Instant.parse(text);
        } catch (DateTimeParseException notAMoment) {
            throw ApiProblem.badRequest("invalid_moment", "We couldn't read that time. Choose it again.");
        }
    }

    /** With its first letter in lower case and no full stop at the end: for a hint said inside a sentence. */
    static String inSentence(String words) {
        String trimmed = words.endsWith(".") ? words.substring(0, words.length() - 1) : words;
        return trimmed.isEmpty() ? trimmed : trimmed.substring(0, 1).toLowerCase(Locale.ROOT) + trimmed.substring(1);
    }

    private static final List<String> SMALL = List.of(
            "zero",
            "one",
            "two",
            "three",
            "four",
            "five",
            "six",
            "seven",
            "eight",
            "nine",
            "ten",
            "eleven",
            "twelve",
            "thirteen",
            "fourteen",
            "fifteen",
            "sixteen",
            "seventeen",
            "eighteen",
            "nineteen");
    private static final List<String> TENS =
            List.of("", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety");

    /** twelve, thirteen, twenty-one. A number of a hundred or more, or below zero, stays in digits. */
    static String inWords(int number) {
        if (number < 0 || number > 99) {
            return Integer.toString(number);
        }
        if (number < 20) {
            return SMALL.get(number);
        }
        return TENS.get(number / 10) + (number % 10 == 0 ? "" : "-" + SMALL.get(number % 10));
    }

    /** A whole number between two bounds, or what was there when it was not sent or sent as nothing. */
    static int number(Fields sent, String name, int min, int max, int otherwise) {
        Integer number = sent.count(name, min, max, otherwise);
        return number == null ? otherwise : number;
    }

    /** In a family the grown-ups keep count; among equals everyone does. */
    static void requireGrownUp(Scene scene, String sentence) {
        if (!scene.iRunTheCircle()) {
            throw new ApiProblem(HttpStatus.FORBIDDEN, "grown_ups_only", sentence);
        }
    }

    /** A card for the top of Today, with the look and the emoji of the board's template. */
    static TodayCard card(
            Scene scene, String title, String line, String figure, String imageUrl, String action, int order) {
        Template template = scene.template();
        return new TodayCard(
                scene.boardId(),
                ThingKind.BOARD,
                template.code(),
                template.emoji(),
                title,
                line,
                figure,
                imageUrl,
                action,
                order);
    }
}
