package app.homeport.api.export;

import app.homeport.api.circle.CircleService;
import app.homeport.api.circle.CircleStore.CircleRow;
import app.homeport.api.circle.MemberStore.MemberRow;
import app.homeport.api.common.ApiProblem;
import app.homeport.api.common.Keyset;
import app.homeport.api.library.LibraryStore;
import app.homeport.api.library.LibraryStore.Item;
import app.homeport.api.list.ChecklistService;
import app.homeport.api.list.ChecklistService.ChecklistResponse;
import app.homeport.api.list.ChecklistService.ItemResponse;
import app.homeport.api.media.MediaStorage;
import app.homeport.api.money.BillService;
import app.homeport.api.money.BillService.BillResponse;
import app.homeport.api.money.BillService.PastDueResponse;
import app.homeport.api.money.sheet.Cells.CellResponse;
import app.homeport.api.money.sheet.SheetService;
import app.homeport.api.money.sheet.SheetService.SheetResponse;
import app.homeport.api.money.sheet.SheetService.TabBriefResponse;
import app.homeport.api.money.sheet.SheetService.TabResponse;
import app.homeport.api.money.sheet.Worked.ColumnResponse;
import app.homeport.api.money.sheet.Worked.RowResponse;
import app.homeport.api.money.sheet.Worked.TileResponse;
import app.homeport.api.money.split.SplitService;
import app.homeport.api.money.split.SplitService.ExpenseResponse;
import app.homeport.api.money.split.SplitService.SplitResponse;
import app.homeport.api.page.BlockKind;
import app.homeport.api.page.BlockService;
import app.homeport.api.page.BlockService.BlockResponse;
import app.homeport.api.page.PageService;
import app.homeport.api.page.PageService.PageResponse;
import app.homeport.api.plan.EventStore;
import app.homeport.api.plan.EventStore.Event;
import app.homeport.api.plan.GoalService;
import app.homeport.api.plan.GoalService.GoalResponse;
import app.homeport.api.plan.ReminderStore;
import app.homeport.api.plan.ReminderStore.Reminder;
import app.homeport.api.thing.ThingKind;
import app.homeport.api.thing.ThingStore;
import app.homeport.api.thing.ThingStore.ThingRow;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;
import java.util.zip.ZipEntry;
import java.util.zip.ZipOutputStream;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

/**
 * Puts one person's export together: one zip of ordinary files that any computer opens, with nothing in it
 * that needs this app to read.
 *
 * <ul>
 *   <li><b>Notes/</b> each page as plain text and as a simple web page; <b>Lists/</b> each list as text
 *   <li><b>Library/</b> photos, videos and files as they were sent, full size, in a folder for each day
 *   <li><b>Sheets/</b> each tab as CSV with what its formulas come to, and the formulas written out beside it
 *   <li><b>Plan/</b> events and reminders as one calendar file every calendar app reads, and goals as CSV
 *   <li><b>Money/</b> bills and each split's expenses as CSV
 *   <li><b>README.txt</b> saying what is what, and what was left out
 * </ul>
 *
 * <p>Everything is read as the person themselves, through each place's own service, so the one sharing rule
 * decides what is in it and nothing else does: a line of a list that is kept from them isn't in their export.
 * The Vault is never in it: the API can't open it. The phone exports the Vault itself.
 *
 * <p>It is bounded: so many bytes of photos and files, so many things of a kind. What a bound kept out is
 * said in the README and with the export.
 */
@Component
class ExportBuilder {

    private static final DateTimeFormatter ICS_DAY = DateTimeFormatter.BASIC_ISO_DATE;
    private static final DateTimeFormatter ICS_TIME = DateTimeFormatter.ofPattern("yyyyMMdd'T'HHmmss");
    private static final DateTimeFormatter ICS_STAMP =
            DateTimeFormatter.ofPattern("yyyyMMdd'T'HHmmss'Z'").withZone(ZoneOffset.UTC);

    /** What came of building one. */
    record Built(Path file, long bytes, int files, List<String> leftOut) {}

    private final CircleService circles;
    private final ThingStore things;
    private final PageService pages;
    private final BlockService blocks;
    private final ChecklistService lists;
    private final LibraryStore library;
    private final MediaStorage storage;
    private final SheetService sheets;
    private final EventStore events;
    private final ReminderStore reminders;
    private final GoalService goals;
    private final BillService bills;
    private final SplitService splits;
    private final long maxBytes;
    private final int maxThings;

    ExportBuilder(
            CircleService circles,
            ThingStore things,
            PageService pages,
            BlockService blocks,
            ChecklistService lists,
            LibraryStore library,
            MediaStorage storage,
            SheetService sheets,
            EventStore events,
            ReminderStore reminders,
            GoalService goals,
            BillService bills,
            SplitService splits,
            @Value("${homeport.export.max-bytes:2147483648}") long maxBytes,
            @Value("${homeport.export.max-things:20000}") int maxThings) {
        this.circles = circles;
        this.things = things;
        this.pages = pages;
        this.blocks = blocks;
        this.lists = lists;
        this.library = library;
        this.storage = storage;
        this.sheets = sheets;
        this.events = events;
        this.reminders = reminders;
        this.goals = goals;
        this.bills = bills;
        this.splits = splits;
        this.maxBytes = maxBytes;
        this.maxThings = maxThings;
    }

    /** One zip being written: its entries get names nothing else in it has. */
    private static final class Zip implements AutoCloseable {
        private final ZipOutputStream out;
        private final Set<String> names = new HashSet<>();
        private final List<String> leftOut = new ArrayList<>();
        private final List<String> contents = new ArrayList<>();
        private int files;

        Zip(Path file) throws IOException {
            this.out = new ZipOutputStream(Files.newOutputStream(file), StandardCharsets.UTF_8);
        }

        /** A name for a file in a folder that no other file there has: "Groceries.txt", then "Groceries (2).txt". */
        String name(String folder, String title, String extension) {
            String base = folder + "/" + clean(title);
            String name = base + extension;
            for (int n = 2; !names.add(name.toLowerCase(Locale.ROOT)); n++) {
                name = base + " (" + n + ")" + extension;
            }
            return name;
        }

        void text(String name, String words) throws IOException {
            out.putNextEntry(new ZipEntry(name));
            out.write(words.getBytes(StandardCharsets.UTF_8));
            out.closeEntry();
            files++;
        }

        OutputStream begin(String name) throws IOException {
            out.putNextEntry(new ZipEntry(name));
            files++;
            return out;
        }

        @Override
        public void close() throws IOException {
            out.close();
        }
    }

    /**
     * Builds the export into a file in the computer's temporary folder. The caller stores it and deletes
     * the file. Throws when the person is no longer in the circle.
     */
    Built build(UUID userId, UUID circleId, ExportScope scope) throws IOException {
        CircleRow circle = circles.require(circleId, userId);
        MemberRow mine = circles.me(circleId, userId);
        Path file = Files.createTempFile("homeport-export-", ".zip");
        try (Zip zip = new Zip(file)) {
            notes(zip, circleId, userId, scope);
            lists(zip, circleId, userId, scope);
            library(zip, circleId, userId, mine, scope);
            sheets(zip, circleId, userId, scope);
            plan(zip, circleId, userId, scope);
            money(zip, circleId, userId, scope);
            zip.text("README.txt", readme(circle, mine, scope, zip));
            return new Built(file, 0, zip.files, List.copyOf(zip.leftOut));
        } catch (IOException | RuntimeException failed) {
            Files.deleteIfExists(file);
            throw failed;
        }
    }

    /** Every thing of a kind in the circle that belongs in this export, newest first, up to the bound. */
    private List<ThingRow> all(Zip zip, UUID circleId, UUID me, ExportScope scope, ThingKind kind, String called) {
        List<ThingRow> found = new ArrayList<>();
        Keyset page = Keyset.first(200);
        while (true) {
            List<ThingRow> rows = things.list(circleId, me, kind, null, null, page);
            rows.stream()
                    .limit(page.limit())
                    .filter(row -> scope == ExportScope.EVERYTHING || row.mine())
                    .forEach(found::add);
            if (rows.size() <= page.limit()) {
                break;
            }
            if (found.size() >= maxThings) {
                zip.leftOut.add("Only the %,d newest %s are in it: that is the most one export holds."
                        .formatted(maxThings, called));
                break;
            }
            ThingRow last = rows.get(page.limit() - 1);
            page = new Keyset(List.of(last.updatedAt().toString(), last.id().toString()), page.limit());
        }
        return found.size() > maxThings ? found.subList(0, maxThings) : found;
    }

    // ---------- Notes ----------

    private void notes(Zip zip, UUID circleId, UUID me, ExportScope scope) throws IOException {
        List<ThingRow> rows = all(zip, circleId, me, scope, ThingKind.PAGE, "pages");
        for (ThingRow row : rows) {
            PageResponse page;
            List<BlockResponse> parts;
            try {
                page = pages.get(row.id(), me);
                parts = blocks.of(row.id(), me);
            } catch (ApiProblem goneMeanwhile) {
                continue;
            }
            String title = page.title().isBlank() ? "Untitled" : page.title();
            StringBuilder text = new StringBuilder(title).append("\n\n");
            StringBuilder html = new StringBuilder(
                            "<!doctype html>\n<html lang=\"en\"><head><meta charset=\"utf-8\"><title>")
                    .append(escape(title))
                    .append("</title></head>\n<body>\n<h1>")
                    .append(escape(title))
                    .append("</h1>\n");
            if (parts.isEmpty()) {
                text.append(page.body()).append("\n");
                page.body()
                        .lines()
                        .forEach(line -> html.append("<p>").append(escape(line)).append("</p>\n"));
            }
            for (BlockResponse block : parts) {
                String words = block.text() == null ? "" : block.text();
                switch (block.kind()) {
                    case HEADING -> {
                        text.append("\n").append(words).append("\n");
                        html.append("<h2>").append(escape(words)).append("</h2>\n");
                    }
                    case BULLET -> {
                        text.append("- ").append(words).append("\n");
                        html.append("<ul><li>").append(escape(words)).append("</li></ul>\n");
                    }
                    case CHECKLIST -> {
                        if (block.checklist() != null) {
                            text.append("\n").append(block.checklist().title()).append("\n");
                            html.append("<h3>")
                                    .append(escape(block.checklist().title()))
                                    .append("</h3>\n<ul>\n");
                            for (ItemResponse item : block.checklist().items()) {
                                text.append(item.done() ? "[x] " : "[ ] ")
                                        .append(item.text())
                                        .append("\n");
                                html.append("<li>")
                                        .append(item.done() ? "☑ " : "☐ ")
                                        .append(escape(item.text()))
                                        .append("</li>\n");
                            }
                            html.append("</ul>\n");
                        }
                    }
                    case LIVE -> {
                        if (block.thing() != null) {
                            String line = block.thing().title()
                                    + (block.thing().glance() == null
                                            ? ""
                                            : " (" + block.thing().glance() + ")");
                            text.append("[").append(line).append("]\n");
                            html.append("<p><em>").append(escape(line)).append("</em></p>\n");
                        }
                    }
                    case PHOTO, FILE -> {
                        String line = (block.kind() == BlockKind.PHOTO ? "Photo" : "File")
                                + (words.isBlank() ? "" : ": " + words);
                        text.append("[").append(line).append("]\n");
                        html.append("<p><em>").append(escape(line)).append("</em></p>\n");
                    }
                    default -> {
                        text.append(words).append("\n");
                        html.append("<p>").append(escape(words)).append("</p>\n");
                    }
                }
            }
            html.append("</body></html>\n");
            String name = zip.name("Notes", title, "");
            zip.text(name + ".txt", text.toString());
            zip.text(name + ".html", html.toString());
        }
        if (!rows.isEmpty()) {
            zip.contents.add("Notes/      %s, each as plain text (.txt) and as a simple web page (.html)"
                    .formatted(many(rows.size(), "page", "pages")));
        }
    }

    // ---------- Lists ----------

    private void lists(Zip zip, UUID circleId, UUID me, ExportScope scope) throws IOException {
        List<ThingRow> rows = all(zip, circleId, me, scope, ThingKind.CHECKLIST, "lists");
        for (ThingRow row : rows) {
            ChecklistResponse list;
            try {
                list = lists.get(row.id(), me);
            } catch (ApiProblem goneMeanwhile) {
                continue;
            }
            String title = list.title().isBlank() ? "Untitled list" : list.title();
            StringBuilder text = new StringBuilder(title).append("\n\n");
            String section = "";
            for (ItemResponse item : list.items()) {
                if (!item.section().equals(section)) {
                    section = item.section();
                    text.append("\n")
                            .append(section.isBlank() ? "Other" : section)
                            .append("\n");
                }
                text.append(item.done() ? "[x] " : "[ ] ").append(item.text());
                if (item.amountCents() != null) {
                    text.append("  ")
                            .append(amount(item.amountCents()))
                            .append(" ")
                            .append(list.currency());
                }
                if (!item.note().isBlank()) {
                    text.append("  (").append(item.note()).append(")");
                }
                text.append("\n");
            }
            zip.text(zip.name("Lists", title, ".txt"), text.toString());
        }
        if (!rows.isEmpty()) {
            zip.contents.add(
                    "Lists/      %s as text, ticked lines marked [x]".formatted(many(rows.size(), "list", "lists")));
        }
    }

    // ---------- Library ----------

    private void library(Zip zip, UUID circleId, UUID me, MemberRow mine, ExportScope scope) throws IOException {
        List<ThingRow> rows = new ArrayList<>();
        rows.addAll(all(zip, circleId, me, scope, ThingKind.PHOTO, "photos"));
        rows.addAll(all(zip, circleId, me, scope, ThingKind.VIDEO, "videos"));
        rows.addAll(all(zip, circleId, me, scope, ThingKind.DOCUMENT, "documents"));
        long written = 0;
        int kept = 0;
        int skipped = 0;
        for (int from = 0; from < rows.size(); from += 200) {
            List<UUID> ids = rows.subList(from, Math.min(from + 200, rows.size())).stream()
                    .map(ThingRow::id)
                    .toList();
            for (Item item : library.items(ids, me, mine.id())) {
                if (item.fileKey() == null) {
                    continue;
                }
                // The bound is on what the files weigh, so one export can't fill the disk it is made on.
                if (written + item.storedBytes() > maxBytes) {
                    skipped++;
                    continue;
                }
                String day = item.takenLocal().toLocalDate().toString();
                String original = item.fileName() == null || item.fileName().isBlank()
                        ? item.thing().kind().code() + "-"
                                + item.id().toString().substring(0, 8) + extension(item.contentType())
                        : item.fileName();
                int dot = original.lastIndexOf('.');
                String name = zip.name(
                        "Library/" + day.substring(0, 4) + "/" + day,
                        dot > 0 ? original.substring(0, dot) : original,
                        dot > 0 ? original.substring(dot) : "");
                try (InputStream file = storage.open(item.fileKey())) {
                    written += file.transferTo(zip.begin(name));
                    zip.out.closeEntry();
                    kept++;
                } catch (IOException missing) {
                    zip.out.closeEntry();
                    skipped++;
                }
            }
        }
        if (kept > 0) {
            zip.contents.add("Library/    %s as they were sent, full size, in a folder for each day"
                    .formatted(many(kept, "photo, video or file", "photos, videos and files")));
        }
        if (skipped > 0) {
            zip.leftOut.add(
                    "%,d photos, videos or files are not in it: one export holds %s of them at most, and a file that couldn't be read is skipped. Ask for another export of only what is yours, or save them from the Library."
                            .formatted(skipped, size(maxBytes)));
        }
    }

    // ---------- Sheets ----------

    private void sheets(Zip zip, UUID circleId, UUID me, ExportScope scope) throws IOException {
        List<ThingRow> rows = all(zip, circleId, me, scope, ThingKind.SHEET, "sheets");
        for (ThingRow row : rows) {
            SheetResponse sheet;
            try {
                sheet = sheets.get(row.id(), me, null, 100, null);
            } catch (ApiProblem goneMeanwhile) {
                continue;
            }
            String folder = "Sheets/" + clean(sheet.title().isBlank() ? "Untitled sheet" : sheet.title());
            for (TabBriefResponse brief : sheet.tabs()) {
                TabResponse tab =
                        sheets.get(row.id(), me, brief.id(), 100, null).tab();
                List<RowResponse> all = new ArrayList<>(tab.rows());
                String next = tab.nextRows();
                while (next != null) {
                    var more = sheets.rows(row.id(), me, brief.id(), Keyset.of(next, 100, 100), null);
                    all.addAll(more.items());
                    next = more.nextCursor();
                }
                StringBuilder csv = new StringBuilder();
                csv.append(tab.columns().stream().map(c -> csv(c.name())).collect(Collectors.joining(",")))
                        .append(",Note\r\n");
                for (RowResponse line : all) {
                    csv.append(tab.columns().stream()
                                    .map(c -> csv(value(line.cells().get(c.id()))))
                                    .collect(Collectors.joining(",")))
                            .append(",")
                            .append(csv(line.note()))
                            .append("\r\n");
                }
                zip.text(zip.name(folder, tab.name(), ".csv"), csv.toString());

                // What each formula is, in words and as it was written: a CSV only holds what they come to.
                StringBuilder formulas = new StringBuilder();
                for (ColumnResponse column : tab.columns()) {
                    if (column.formula() != null && !column.formula().isBlank()) {
                        formulas.append("Column \"")
                                .append(column.name())
                                .append("\" = ")
                                .append(column.formula());
                        if (column.says() != null && !column.says().isBlank()) {
                            formulas.append("\n    ").append(column.says());
                        }
                        formulas.append("\n");
                    }
                }
                for (TileResponse tile : tab.tiles()) {
                    formulas.append("Tile \"")
                            .append(tile.name())
                            .append("\" = ")
                            .append(tile.formula());
                    formulas.append("\n    comes to ").append(SheetService.words(tile.cell(), sheet.currency()));
                    formulas.append("\n");
                }
                if (!formulas.isEmpty()) {
                    zip.text(zip.name(folder, tab.name() + " formulas", ".txt"), formulas.toString());
                }
            }
        }
        if (!rows.isEmpty()) {
            zip.contents.add(
                    "Sheets/     %s: a .csv for each tab (formulas as the values they come to), and the formulas themselves written out in a .txt beside it"
                            .formatted(many(rows.size(), "sheet", "sheets")));
        }
    }

    /** A cell as a spreadsheet reads it: money and numbers as plain numbers, a day as 2026-11-12. */
    private static String value(CellResponse cell) {
        if (cell == null) {
            return "";
        }
        return switch (cell.kind()) {
            case MONEY -> amount(cell.cents());
            case NUMBER -> cell.number().toPlainString();
            case TEXT -> cell.text();
            case DATE -> cell.date().toString();
            case TICK -> Boolean.TRUE.equals(cell.ticked()) ? "yes" : "no";
            case PERSON -> cell.people().stream().map(p -> p.name()).collect(Collectors.joining(", "));
            case EMPTY, PROBLEM -> "";
        };
    }

    // ---------- Plan ----------

    private void plan(Zip zip, UUID circleId, UUID me, ExportScope scope) throws IOException {
        List<UUID> eventIds = all(zip, circleId, me, scope, ThingKind.EVENT, "events").stream()
                .map(ThingRow::id)
                .toList();
        List<UUID> reminderIds = all(zip, circleId, me, scope, ThingKind.REMINDER, "reminders").stream()
                .map(ThingRow::id)
                .toList();
        if (!eventIds.isEmpty() || !reminderIds.isEmpty()) {
            StringBuilder ics =
                    new StringBuilder("BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//Homeport//Export//EN\r\n");
            String stamp = ICS_STAMP.format(Instant.now());
            for (int from = 0; from < eventIds.size(); from += 200) {
                for (Event event : events.findAll(eventIds.subList(from, Math.min(from + 200, eventIds.size())), me)) {
                    var e = event.detail();
                    ics.append("BEGIN:VEVENT\r\nUID:")
                            .append(e.id())
                            .append("@homeport\r\nDTSTAMP:")
                            .append(stamp)
                            .append("\r\n");
                    if (e.startTime() == null) {
                        ics.append("DTSTART;VALUE=DATE:")
                                .append(ICS_DAY.format(e.startsOn()))
                                .append("\r\n");
                        ics.append("DTEND;VALUE=DATE:")
                                .append(ICS_DAY.format(e.endsOn().plusDays(1)))
                                .append("\r\n");
                    } else {
                        ics.append("DTSTART;TZID=")
                                .append(e.timeZone())
                                .append(":")
                                .append(ICS_TIME.format(e.startsOn().atTime(e.startTime())))
                                .append("\r\n");
                        if (e.endTime() != null) {
                            ics.append("DTEND;TZID=")
                                    .append(e.timeZone())
                                    .append(":")
                                    .append(ICS_TIME.format(e.endsOn().atTime(e.endTime())))
                                    .append("\r\n");
                        }
                    }
                    line(ics, "SUMMARY", event.thing().title());
                    line(ics, "LOCATION", e.placeWords());
                    line(ics, "DESCRIPTION", e.notes());
                    rule(ics, e.repeat());
                    ics.append("END:VEVENT\r\n");
                }
            }
            for (int from = 0; from < reminderIds.size(); from += 200) {
                for (Reminder reminder :
                        reminders.findAll(reminderIds.subList(from, Math.min(from + 200, reminderIds.size())), me)) {
                    var r = reminder.detail();
                    ics.append("BEGIN:VTODO\r\nUID:")
                            .append(r.id())
                            .append("@homeport\r\nDTSTAMP:")
                            .append(stamp)
                            .append("\r\n");
                    if (r.dueOn() != null && r.dueTime() != null) {
                        ics.append("DUE;TZID=")
                                .append(r.timeZone())
                                .append(":")
                                .append(ICS_TIME.format(r.dueOn().atTime(r.dueTime())))
                                .append("\r\n");
                    } else if (r.dueOn() != null) {
                        ics.append("DUE;VALUE=DATE:")
                                .append(ICS_DAY.format(r.dueOn()))
                                .append("\r\n");
                    }
                    line(ics, "SUMMARY", reminder.thing().title());
                    line(ics, "LOCATION", r.placeWords());
                    line(ics, "DESCRIPTION", r.notes());
                    rule(ics, r.repeat());
                    ics.append(r.doneAt() == null ? "STATUS:NEEDS-ACTION\r\n" : "STATUS:COMPLETED\r\n");
                    ics.append("END:VTODO\r\n");
                }
            }
            ics.append("END:VCALENDAR\r\n");
            zip.text("Plan/calendar.ics", ics.toString());
            zip.contents.add("Plan/       calendar.ics: %s and %s, for any calendar app to bring in"
                    .formatted(
                            many(eventIds.size(), "event", "events"),
                            many(reminderIds.size(), "reminder", "reminders")));
        }
        List<ThingRow> goalRows = all(zip, circleId, me, scope, ThingKind.GOAL, "goals");
        if (!goalRows.isEmpty()) {
            StringBuilder csv = new StringBuilder("Goal,How far,Target,Unit,Started,By\r\n");
            for (ThingRow row : goalRows) {
                try {
                    GoalResponse goal = goals.get(row.id(), me, null, null);
                    csv.append(csv(goal.title()))
                            .append(",")
                            .append(csv(goal.currentLabel()))
                            .append(",")
                            .append(csv(goal.targetLabel()))
                            .append(",")
                            .append(csv(goal.unit().code()))
                            .append(",")
                            .append(goal.startDay())
                            .append(",")
                            .append(csv(goal.byLabel() == null ? "" : goal.byLabel()))
                            .append("\r\n");
                } catch (ApiProblem goneMeanwhile) {
                    // it went while the export was being made
                }
            }
            zip.text("Plan/goals.csv", csv.toString());
            zip.contents.add("Plan/       goals.csv: %s, and how far each has got"
                    .formatted(many(goalRows.size(), "goal", "goals")));
        }
    }

    private static void line(StringBuilder ics, String name, String words) {
        if (words != null && !words.isBlank()) {
            ics.append(name)
                    .append(":")
                    .append(words.replace("\\", "\\\\")
                            .replace(";", "\\;")
                            .replace(",", "\\,")
                            .replace("\r", "")
                            .replace("\n", "\\n"))
                    .append("\r\n");
        }
    }

    private static void rule(StringBuilder ics, app.homeport.api.plan.Recurrence repeat) {
        if (repeat == null) {
            return;
        }
        ics.append("RRULE:FREQ=")
                .append(
                        switch (repeat.unit()) {
                            case DAY -> "DAILY";
                            case WEEK -> "WEEKLY";
                            case MONTH -> "MONTHLY";
                            case YEAR -> "YEARLY";
                        });
        if (repeat.every() != null && repeat.every() > 1) {
            ics.append(";INTERVAL=").append(repeat.every());
        }
        if (repeat.days() != null && !repeat.days().isEmpty()) {
            ics.append(";BYDAY=")
                    .append(repeat.days().stream()
                            .sorted()
                            .map(day -> day.name().substring(0, 2))
                            .collect(Collectors.joining(",")));
        }
        if (repeat.until() != null) {
            ics.append(";UNTIL=").append(ICS_DAY.format(repeat.until()));
        }
        ics.append("\r\n");
    }

    // ---------- Money ----------

    private void money(Zip zip, UUID circleId, UUID me, ExportScope scope) throws IOException {
        List<ThingRow> billRows = all(zip, circleId, me, scope, ThingKind.BILL, "bills");
        if (!billRows.isEmpty()) {
            StringBuilder csv =
                    new StringBuilder("Bill,Paid to,Due on,Amount,Currency,Paid,Comes round,Your share\r\n");
            for (ThingRow row : billRows) {
                BillResponse bill;
                try {
                    bill = bills.get(row.id(), me);
                } catch (ApiProblem goneMeanwhile) {
                    continue;
                }
                String share =
                        bill.myShare() == null ? "" : amount(bill.myShare().cents());
                List<PastDueResponse> times = bill.history().isEmpty()
                        ? List.of(new PastDueResponse(bill.dueOn(), bill.amountCents(), bill.paid(), true))
                        : bill.history();
                for (PastDueResponse due : times) {
                    csv.append(csv(bill.title()))
                            .append(",")
                            .append(csv(bill.payee()))
                            .append(",")
                            .append(due.dueOn())
                            .append(",")
                            .append(amount(due.amountCents()))
                            .append(",")
                            .append(bill.currency())
                            .append(",")
                            .append(due.paid() ? "yes" : "no")
                            .append(",")
                            .append(bill.repeat().code())
                            .append(",")
                            .append(due.current() ? share : "")
                            .append("\r\n");
                }
            }
            zip.text("Money/bills.csv", csv.toString());
            zip.contents.add("Money/      bills.csv: %s, a line for each time one was due"
                    .formatted(many(billRows.size(), "bill", "bills")));
        }
        List<ThingRow> splitRows = all(zip, circleId, me, scope, ThingKind.SPLIT, "splits");
        for (ThingRow row : splitRows) {
            SplitResponse split;
            try {
                split = splits.get(row.id(), me);
            } catch (ApiProblem goneMeanwhile) {
                continue;
            }
            StringBuilder csv = new StringBuilder("Spent on,What,Amount,Currency,Paid by,Split between\r\n");
            Keyset page = Keyset.first(100);
            while (true) {
                var expenses = splits.expenses(row.id(), me, page);
                for (ExpenseResponse expense : expenses.items()) {
                    csv.append(expense.spentOn())
                            .append(",")
                            .append(csv(expense.title()))
                            .append(",")
                            .append(amount(expense.amountCents()))
                            .append(",")
                            .append(split.currency())
                            .append(",")
                            .append(csv(
                                    expense.paidBy() == null
                                            ? ""
                                            : expense.paidBy().name()))
                            .append(",")
                            .append(csv(expense.shares().stream()
                                    .map(share -> share.person().name() + " " + amount(share.cents()))
                                    .collect(Collectors.joining("; "))))
                            .append("\r\n");
                }
                if (expenses.nextCursor() == null) {
                    break;
                }
                page = Keyset.of(expenses.nextCursor(), 100, 100);
            }
            zip.text(zip.name("Money", split.title() + " expenses", ".csv"), csv.toString());
        }
        if (!splitRows.isEmpty()) {
            zip.contents.add("Money/      %s of shared costs, each with every expense and who shared it"
                    .formatted(many(splitRows.size(), "group", "groups")));
        }
    }

    // ---------- the README ----------

    private String readme(CircleRow circle, MemberRow mine, ExportScope scope, Zip zip) {
        StringBuilder text = new StringBuilder();
        text.append("Homeport export\n===============\n\n");
        text.append("Circle:   ").append(circle.name()).append("\n");
        text.append("For:      ").append(mine.name()).append("\n");
        text.append("Made on:  ").append(LocalDate.now(ZoneOffset.UTC)).append("\n");
        text.append("Holds:    ")
                .append(
                        scope == ExportScope.MINE
                                ? "what you made in this circle, shared or not"
                                : "everything in this circle you can see: yours, and what others shared with you")
                .append("\n\nWhat is what\n------------\n");
        if (zip.contents.isEmpty()) {
            text.append("There was nothing to export.\n");
        }
        zip.contents.forEach(line -> text.append(line).append("\n"));
        text.append("\nEverything is in ordinary formats: text, web pages, CSV (opens in Excel, Numbers and Google\n");
        text.append("Sheets), a calendar file, and your photos and files exactly as you added them.\n");
        text.append("\nWhat is not in it\n-----------------\n");
        text.append("The Vault. Passwords, cards and codes are scrambled on your phone with a key only you hold, so\n");
        text.append("the service can't put them in a file. Export the Vault from the app itself: Export and\n");
        text.append("leaving, then Export the Vault.\n");
        text.append("\nTemplates that do work (the meal plan, the chore wheel, the time capsule and the like) are\n");
        text.append("not in it either: some of them hold letters that are sealed, also from you.\n");
        text.append("\nAlbums and folders are ways of arranging things; the things themselves are here.\n");
        if (scope == ExportScope.EVERYTHING) {
            text.append("\nA line of a list that is kept from you is not in your export, as it is not in your app.\n");
        }
        if (!zip.leftOut.isEmpty()) {
            text.append("\nLeft out because of its size\n----------------------------\n");
            zip.leftOut.forEach(line -> text.append(line).append("\n"));
        }
        return text.toString();
    }

    // ---------- small pieces ----------

    /** "1 page", "31 pages". */
    static String many(int count, String one, String many) {
        return "%,d %s".formatted(count, count == 1 ? one : many);
    }

    /** A title as a file name: nothing a computer refuses in a name, and not too long. */
    static String clean(String title) {
        String name = title.replaceAll("[\\\\/:*?\"<>|\\p{Cntrl}]", "-")
                .replaceAll("\\s+", " ")
                .strip();
        name = name.replaceAll("^\\.+", "");
        if (name.isEmpty()) {
            return "Untitled";
        }
        return name.length() > 80 ? name.substring(0, 80).strip() : name;
    }

    /** A value in a CSV file: quoted when it holds a comma, a quote or a line break. */
    static String csv(String value) {
        if (value == null) {
            return "";
        }
        return value.contains(",") || value.contains("\"") || value.contains("\n") || value.contains("\r")
                ? "\"" + value.replace("\"", "\"\"") + "\""
                : value;
    }

    /** Cents as a plain number a spreadsheet adds up: 8420 is 84.20. */
    static String amount(long cents) {
        return BigDecimal.valueOf(cents, 2).toPlainString();
    }

    private static String escape(String words) {
        return words.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;");
    }

    private static String extension(String contentType) {
        if (contentType == null) {
            return "";
        }
        return switch (contentType) {
            case "image/jpeg" -> ".jpg";
            case "image/png" -> ".png";
            case "image/heic" -> ".heic";
            case "video/mp4" -> ".mp4";
            case "video/quicktime" -> ".mov";
            case "application/pdf" -> ".pdf";
            default -> "";
        };
    }

    static String size(long bytes) {
        return bytes >= 1L << 30
                ? "%.0f GB".formatted(bytes / (double) (1L << 30))
                : "%.0f MB".formatted(bytes / (double) (1L << 20));
    }
}
