package app.homeport.api.activity;

import java.util.Locale;
import java.util.Map;

/**
 * Turns the name of a job into what someone did: "Feed Biscuit" into "fed Biscuit", "Set the table" into
 * "set the table". By rule, not by guessing: a job that starts with a verb on the list below is put in the
 * past. Any other ("Laundry", "Bins and recycling") is said as "finished Laundry".
 */
public final class PastTense {

    private PastTense() {}

    /** The verbs chores start with, and how each is said once it is done. */
    private static final Map<String, String> DONE = Map.ofEntries(
            Map.entry("feed", "fed"),
            Map.entry("set", "set"),
            Map.entry("take", "took"),
            Map.entry("put", "put"),
            Map.entry("make", "made"),
            Map.entry("do", "did"),
            Map.entry("walk", "walked"),
            Map.entry("water", "watered"),
            Map.entry("wash", "washed"),
            Map.entry("clean", "cleaned"),
            Map.entry("clear", "cleared"),
            Map.entry("tidy", "tidied"),
            Map.entry("empty", "emptied"),
            Map.entry("fold", "folded"),
            Map.entry("hang", "hung"),
            Map.entry("hoover", "hoovered"),
            Map.entry("vacuum", "vacuumed"),
            Map.entry("sweep", "swept"),
            Map.entry("mop", "mopped"),
            Map.entry("dust", "dusted"),
            Map.entry("cook", "cooked"),
            Map.entry("bake", "baked"),
            Map.entry("load", "loaded"),
            Map.entry("unload", "unloaded"),
            Map.entry("pack", "packed"),
            Map.entry("unpack", "unpacked"),
            Map.entry("brush", "brushed"),
            Map.entry("practise", "practised"),
            Map.entry("practice", "practiced"),
            Map.entry("read", "read"),
            Map.entry("mow", "mowed"),
            Map.entry("rake", "raked"),
            Map.entry("lay", "laid"),
            Map.entry("bring", "brought"),
            Map.entry("buy", "bought"),
            Map.entry("call", "called"),
            Map.entry("check", "checked"),
            Map.entry("sort", "sorted"),
            Map.entry("iron", "ironed"),
            Map.entry("change", "changed"),
            Map.entry("help", "helped"));

    public static String of(String job) {
        String name = job == null ? "" : job.trim();
        if (name.isEmpty()) {
            return "finished a job";
        }
        int space = name.indexOf(' ');
        String first = (space < 0 ? name : name.substring(0, space)).toLowerCase(Locale.ROOT);
        String done = DONE.get(first);
        if (done == null || space < 0) {
            return "finished " + name;
        }
        return done + name.substring(space);
    }
}
