package app.homeport.api.money;

import java.text.Normalizer;
import java.time.DateTimeException;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Reads a bill, a receipt or a subscription email from its lines of text: who to pay, how much, by when, the
 * IBAN and the reference. By rules, with no service and no library: the phone reads the words off the photo
 * or the PDF, and this finds the five things in them. It suggests, and says which line each thing came from,
 * so the person can check it before saving.
 *
 * <p>The rules, in short:
 *
 * <ul>
 *   <li><b>Amount:</b> the number on the line that says what to pay ("Amount due", "Total", "Za plačilo",
 *       "Zu zahlen", "À payer"), not the ones on lines about tax, a subtotal or change. With several such
 *       lines, the largest; with none, the largest amount that carries a currency or cents. Both "1.234,56"
 *       and "1,234.56" are read: the last mark followed by one or two digits is the decimal mark.
 *   <li><b>Due:</b> the date on a line that says when ("Due", "Pay by", "Rok plačila", "Fällig", "Next billing
 *       date"). Dates are read day first (12.11.2026 is 12 November) unless that can't be; a date with no
 *       year is the next time that day comes.
 *   <li><b>IBAN:</b> anything that looks like one and passes the IBAN's own check sum.
 *   <li><b>Reference:</b> an RF or SI reference, or what follows "Reference", "Sklic" and their cousins;
 *       failing that, the invoice number.
 *   <li><b>Who to pay:</b> what follows "Payee", "Prejemnik" or "From:"; else a subscription it knows by
 *       name; else the first line that names a company (d.o.o., GmbH, Ltd); else the first line that looks
 *       like a name.
 * </ul>
 */
public final class BillReader {

    private BillReader() {}

    /**
     * One thing that was read, and the line it was read from.
     *
     * @param line the line as it was sent
     * @param lineNumber which of the lines sent that was, counting from 0
     */
    public record Found<T>(T value, String line, int lineNumber) {}

    /**
     * What was read. Everything but the currency, the title and the emoji is null when it wasn't found.
     *
     * @param amountCents the amount to pay, in cents
     * @param currency the currency found next to an amount, or EUR when none was
     * @param repeat set when the text says, or the kind of bill suggests, how it comes round
     * @param title a name for the bill: Electricity, Netflix, or who to pay
     */
    public record Reading(
            Found<String> payee,
            Found<Long> amountCents,
            String currency,
            Found<LocalDate> dueOn,
            Found<String> iban,
            Found<String> reference,
            Found<Repeat> repeat,
            String title,
            String emoji) {}

    // ---------- the words it knows ----------

    private static final List<String> PAY_THIS = List.of(
            "amount due",
            "total due",
            "balance due",
            "amount payable",
            "total payable",
            "to pay",
            "amount to be paid",
            "please pay",
            "grand total",
            "total amount",
            "invoice total",
            "order total",
            "amount charged",
            "amount paid",
            "you paid",
            "total charged",
            "be charged",
            "incl. vat",
            "incl vat",
            "inc. vat",
            "inc vat",
            "including vat",
            "including tax",
            "za placilo",
            "skupaj z ddv",
            "z ddv",
            "zu zahlen",
            "zahlbetrag",
            "rechnungsbetrag",
            "gesamtbetrag",
            "endbetrag",
            "inkl. mwst",
            "inkl mwst",
            "brutto",
            "a payer",
            "total ttc",
            "montant ttc",
            "a pagar",
            "importe total",
            "da pagare",
            "totale fattura",
            "te betalen");

    private static final List<String> A_TOTAL = List.of(
            "total",
            "skupaj",
            "summe",
            "gesamt",
            "totale",
            "amount",
            "znesek",
            "betrag",
            "montant",
            "importe",
            "importo",
            "price",
            "cena",
            "preis",
            "prix",
            "monthly fee",
            "narocnina",
            "subscription",
            "membership");

    private static final List<String> NOT_THIS = List.of(
            "subtotal",
            "sub-total",
            "sub total",
            "vat",
            "ddv",
            "tax",
            "mwst",
            "ust.",
            "tva",
            "iva",
            "btw",
            "neto",
            "netto",
            "net ",
            "osnova",
            "excl",
            "brez ddv",
            "ohne",
            "hors taxe",
            " ht",
            "change",
            "vracilo",
            "cash",
            "gotovina",
            "tendered",
            "discount",
            "popust",
            "rabatt",
            "previous",
            "prejsnj",
            "balance forward",
            "deposit",
            "tip",
            "trinkgeld",
            "limit",
            "per unit",
            "unit price",
            "saved",
            "prihranili");

    private static final List<String> DUE = List.of(
            "due",
            "pay by",
            "pay before",
            "payable by",
            "payment date",
            "rok placila",
            "rok za placilo",
            "placati do",
            "zapade",
            "zapadlost",
            "valuta",
            "fallig",
            "faellig",
            "zahlbar bis",
            "zahlungsziel",
            "echeance",
            "a payer avant",
            "vencimiento",
            "fecha limite",
            "scadenza",
            "vervaldatum",
            "betalen voor",
            "next billing",
            "next payment",
            "next charge",
            "billing date",
            "renews",
            "renewal",
            "renew on",
            "be charged",
            "dospijec",
            "naslednje placilo");

    private static final List<String> REFERENCE = List.of(
            "payment reference",
            "reference number",
            "reference no",
            "reference de paiement",
            "zahlungsreferenz",
            "verwendungszweck",
            "betalingskenmerk",
            "referencia",
            "riferimento",
            "referenca",
            "reference",
            "referenz",
            "kenmerk",
            "sklic",
            "ref.",
            "ref:",
            "ref no",
            "ref #");

    private static final List<String> INVOICE_NUMBER = List.of(
            "invoice number",
            "invoice no",
            "invoice #",
            "invoice nr",
            "stevilka racuna",
            "racun st",
            "rechnungsnummer",
            "rechnungs-nr",
            "rechnung nr",
            "numero de facture",
            "facture n",
            "numero fattura",
            "fattura n",
            "numero de factura",
            "factura n",
            "factuurnummer",
            "order number",
            "order no",
            "order #");

    private static final List<String> PAYEE = List.of(
            "zahlungsempfanger",
            "payable to",
            "beneficiary",
            "beneficiaire",
            "beneficiario",
            "upravicenec",
            "izdajatelj",
            "prodajalec",
            "prejemnik",
            "recipient",
            "empfanger",
            "issued by",
            "billed by",
            "creditor",
            "pay to",
            "seller",
            "payee");

    /** Lines that are about the paper, the customer or the shop's details, never the name of who to pay. */
    private static final List<String> NOT_A_NAME = List.of(
            "invoice",
            "racun",
            "rechnung",
            "facture",
            "factura",
            "fattura",
            "receipt",
            "statement",
            "bill",
            "tax",
            "vat",
            "ddv",
            "tel",
            "phone",
            "fax",
            "www",
            "http",
            "https",
            "date",
            "datum",
            "page",
            "stran",
            "customer",
            "kupec",
            "kunde",
            "client",
            "dear",
            "hello",
            "hi",
            "hey",
            "thank",
            "thanks",
            "hvala",
            "danke",
            "merci",
            "welcome",
            "order",
            "narocilo",
            "table",
            "miza",
            "your",
            "you",
            "please",
            "we",
            "our",
            "copy",
            "original",
            "number",
            "total",
            "amount",
            "znesek",
            "iban",
            "sklic",
            "reference",
            "due");

    private static final Pattern COMPANY =
            Pattern.compile("(?<![\\p{L}.])(?:d\\.\\s?o\\.\\s?o\\.?|D\\.\\s?O\\.\\s?O\\.?"
                    + "|d\\.\\s?d\\.?|D\\.\\s?D\\.?|s\\.\\s?p\\.|S\\.\\s?P\\.|d\\.\\s?n\\.\\s?o\\.?|GmbH|GMBH|gmbh|AG|KG|UG|OHG"
                    + "|Ltd\\.?|LTD\\.?|ltd\\.?|Limited|LIMITED|LLC|Inc\\.?|INC\\.?|Corp\\.?|PLC|plc|S\\.A\\.S\\.?|SAS|SARL"
                    + "|S\\.A\\.?|S\\.r\\.l\\.?|S\\.R\\.L\\.?|S\\.p\\.A\\.?|B\\.V\\.?|N\\.V\\.?|Oy|AB|A/S|s\\.r\\.o\\.?"
                    + "|Sp\\. z o\\.o\\.?|S\\.L\\.?|SA|NV|BV)(?![\\p{L}])");

    /** A kind of bill it knows by a word in the text: what to call it, its picture, and whether it comes every month. */
    private record Known(String title, String emoji, boolean monthly, boolean brand, List<String> words) {}

    private static final List<Known> KNOWN = List.of(
            new Known("Netflix", "📺", true, true, List.of("netflix")),
            new Known("Spotify", "🎵", true, true, List.of("spotify")),
            new Known("Disney+", "📺", true, true, List.of("disney+", "disney plus")),
            new Known("YouTube Premium", "📺", true, true, List.of("youtube premium")),
            new Known("Apple Music", "🎵", true, true, List.of("apple music")),
            new Known("iCloud", "☁️", true, true, List.of("icloud")),
            new Known("Amazon Prime", "📦", true, true, List.of("amazon prime", "prime video")),
            new Known("HBO Max", "📺", true, true, List.of("hbo")),
            new Known("Adobe", "🎨", true, true, List.of("adobe")),
            new Known("Microsoft 365", "💻", true, true, List.of("microsoft 365", "office 365")),
            new Known("Google One", "☁️", true, true, List.of("google one")),
            new Known("Dropbox", "☁️", true, true, List.of("dropbox")),
            new Known("Audible", "🎧", true, true, List.of("audible")),
            new Known("Electricity", "⚡", true, false, List.of("elektr", "electric", "strom", "kwh")),
            new Known("Gas", "🔥", true, false, List.of("plin", "natural gas", "gas bill", "gas supply", "erdgas")),
            new Known(
                    "Water",
                    "💧",
                    true,
                    false,
                    List.of("vodovod", "vodarina", "voda", "vode", "komunal", "water", "wasser")),
            new Known("Heating", "🔥", true, false, List.of("ogrevanje", "toplota", "heating", "heizung")),
            new Known("Internet", "🌐", true, false, List.of("internet", "broadband", "optika", "fibre", "fiber")),
            new Known(
                    "Phone",
                    "📱",
                    true,
                    false,
                    List.of("mobile", "mobiln", "mobitel", "telefon", "phone plan", "mobilfunk")),
            new Known("Rent", "🏠", true, false, List.of("najemnina", "rent ", "miete", "loyer")),
            new Known("Insurance", "🛡️", false, false, List.of("zavarovan", "insurance", "versicherung")),
            new Known("Waste", "🗑️", true, false, List.of("odpadk", "waste", "abfall")));

    private static final Map<String, Integer> MONTHS = months();

    private static Map<String, Integer> months() {
        Map<String, Integer> all = new LinkedHashMap<>();
        String[][] names = {
            {"january", "jan", "januar", "januarja", "janvier", "enero", "gennaio"},
            {"february", "feb", "februar", "februarja", "fevrier", "febrero", "febbraio"},
            {"march", "mar", "marec", "marca", "marz", "mrz", "mars", "marzo"},
            {"april", "apr", "aprila", "avril", "abril", "aprile"},
            {"may", "maj", "maja", "mai", "mayo", "maggio"},
            {"june", "jun", "junij", "junija", "juni", "juin", "junio", "giugno"},
            {"july", "jul", "julij", "julija", "juli", "juillet", "julio", "luglio"},
            {"august", "aug", "avgust", "avgusta", "avg", "aout", "agosto"},
            {"september", "sep", "sept", "septembra", "septembre", "septiembre", "settembre"},
            {"october", "oct", "oktober", "oktobra", "okt", "octobre", "octubre", "ottobre"},
            {"november", "nov", "novembra", "novembre", "noviembre"},
            {"december", "dec", "decembra", "dezember", "dez", "decembre", "diciembre", "dicembre"}
        };
        for (int month = 0; month < names.length; month++) {
            for (String name : names[month]) {
                all.put(name, month + 1);
            }
        }
        return all;
    }

    private static final Pattern ISO_DATE = Pattern.compile("(?<!\\d)(\\d{4})-(\\d{1,2})-(\\d{1,2})(?!\\d)");
    private static final Pattern NUMBER_DATE =
            Pattern.compile("(?<!\\d)(\\d{1,2})\\s?([./-])\\s?(\\d{1,2})\\s?\\2\\s?(\\d{4}|\\d{2})(?!\\d)");
    private static final Pattern DAY_MONTH_NAME = Pattern.compile(
            "(?<!\\d)(\\d{1,2})(?:st|nd|rd|th|\\.)?\\s+(?:of\\s+)?(\\p{L}{3,10})\\.?,?(?:\\s+(\\d{4}))?(?!\\d)");
    private static final Pattern MONTH_NAME_DAY = Pattern.compile(
            "(?<!\\p{L})(\\p{L}{3,10})\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?(?!\\d)(?:,?\\s+(\\d{4}))?(?!\\d)");
    private static final Pattern DAY_MONTH = Pattern.compile("(?<!\\d)(\\d{1,2})\\.\\s?(\\d{1,2})\\.(?!\\s?\\d)");

    private static final Pattern AMOUNT = Pattern.compile(
            "(?<![\\d.,])(\\d{1,3}(?:[.,' \\u00a0\\u2019]\\d{3})+|\\d+)(?:[.,](\\d{1,2}))?(?!\\d|[.,]\\d)");
    private static final Pattern CURRENCY_BEFORE = Pattern.compile("(€|eur|\\$|usd|£|gbp|chf)\\s?$");
    private static final Pattern CURRENCY_AFTER = Pattern.compile("^\\s?(€|eur|\\$|usd|£|gbp|chf)(?![a-z])");
    private static final Pattern UNIT_AFTER = Pattern.compile(
            "^\\s?(%|x\\b|kwh|mwh|kw\\b|m3|m2|m²|m³|kg\\b|g\\b|l\\b|km\\b|gb\\b|mb\\b|min\\b|pcs|kos\\b|kom\\b|stk)");

    private static final Pattern IBAN_START = Pattern.compile("(?<![A-Z0-9])[A-Z]{2}\\d{2}(?=[ ]?[A-Z0-9])");
    private static final Map<String, Integer> IBAN_LENGTHS = Map.ofEntries(
            Map.entry("SI", 19),
            Map.entry("DE", 22),
            Map.entry("AT", 20),
            Map.entry("GB", 22),
            Map.entry("FR", 27),
            Map.entry("IT", 27),
            Map.entry("ES", 24),
            Map.entry("NL", 18),
            Map.entry("BE", 16),
            Map.entry("HR", 21),
            Map.entry("CH", 21),
            Map.entry("PT", 25),
            Map.entry("IE", 22),
            Map.entry("LU", 20),
            Map.entry("DK", 18),
            Map.entry("SE", 24),
            Map.entry("NO", 15),
            Map.entry("FI", 18),
            Map.entry("PL", 28),
            Map.entry("CZ", 24),
            Map.entry("SK", 24),
            Map.entry("HU", 28));

    private static final Pattern RF_REFERENCE =
            Pattern.compile("(?<![A-Z0-9])RF\\d{2}(?:[ ]?[A-Z0-9]{1,4}){1,6}(?![A-Z0-9])");
    private static final Pattern SI_REFERENCE =
            Pattern.compile("(?<![A-Z0-9])(?:SI|HR)\\d{2}[ ]?\\d[\\d -]{2,24}\\d(?![A-Z0-9])");
    private static final Pattern REFERENCE_VALUE = Pattern.compile(
            "^[\\s:#.°º]*(?:(?:no|nr|st|number|numero|num)\\b\\.?)?[\\s:#.°º]*([\\p{L}\\d][\\p{L}\\d /-]{1,34})",
            Pattern.CASE_INSENSITIVE | Pattern.UNICODE_CASE);

    // ---------- reading ----------

    /** One line as sent, and the same line in small letters without accents, letter for letter. */
    private record Line(int number, String text, String plain) {}

    private record Span(int start, int end) {}

    private record DateIn(LocalDate date, int start, int end) {}

    private record Money(long cents, String currency, int score, Line line) {}

    public static Reading read(List<String> sent, LocalDate today) {
        List<Line> lines = new ArrayList<>();
        for (int i = 0; i < sent.size(); i++) {
            String text = sent.get(i) == null ? "" : Normalizer.normalize(sent.get(i), Normalizer.Form.NFC);
            lines.add(new Line(i, text.strip(), plain(text.strip())));
        }
        Found<String> iban = iban(lines);
        Found<String> reference = reference(lines);
        Found<LocalDate> due = due(lines, today);
        Money money = amount(lines, today);
        Known known = known(lines);
        Found<String> payee = payee(lines, known);
        Found<Repeat> repeat = repeat(lines, known);
        String title = known != null ? known.title() : payee != null ? payee.value() : "";
        return new Reading(
                payee,
                money == null
                        ? null
                        : new Found<>(
                                money.cents(), money.line().text(), money.line().number()),
                money == null ? currencyAnywhere(lines) : money.currency(),
                due,
                iban,
                reference,
                repeat,
                title,
                known != null ? known.emoji() : "🧾");
    }

    /** Small letters without accents, the same length as the text: "Za plačilo" is "za placilo". */
    static String plain(String text) {
        StringBuilder plain = new StringBuilder(text.length());
        for (int i = 0; i < text.length(); i++) {
            char c = text.charAt(i);
            String base = Normalizer.normalize(String.valueOf(c), Normalizer.Form.NFD)
                    .replaceAll("\\p{M}", "")
                    .toLowerCase(Locale.ROOT);
            plain.append(base.length() == 1 ? base.charAt(0) : Character.toLowerCase(c));
        }
        return plain.toString();
    }

    /** True when the line holds one of the words, at the start of a word: "vat" is in "incl. VAT", not in "private". */
    private static boolean has(String plain, List<String> words) {
        return where(plain, words) >= 0;
    }

    /** Where the first of these words stands in the line, or -1. */
    private static int where(String plain, List<String> words) {
        int first = -1;
        for (String word : words) {
            int at = find(plain, word, false);
            if (at >= 0 && (first < 0 || at < first)) {
                first = at;
            }
        }
        return first;
    }

    /** True when the line holds one of the words as a whole word: "tax" is not in "taxi". */
    private static boolean hasWhole(String plain, List<String> words) {
        return words.stream().anyMatch(word -> find(plain, word, true) >= 0);
    }

    private static int find(String plain, String word, boolean whole) {
        for (int at = plain.indexOf(word); at >= 0; at = plain.indexOf(word, at + 1)) {
            boolean startsAWord =
                    !Character.isLetter(word.charAt(0)) || at == 0 || !Character.isLetter(plain.charAt(at - 1));
            int end = at + word.length();
            boolean endsAWord = !whole || end == plain.length() || !Character.isLetter(plain.charAt(end));
            if (startsAWord && endsAWord) {
                return at;
            }
        }
        return -1;
    }

    // ---------- dates ----------

    static List<DateIn> dates(String plain, LocalDate today) {
        List<DateIn> found = new ArrayList<>();
        Matcher iso = ISO_DATE.matcher(plain);
        while (iso.find()) {
            add(found, date(num(iso.group(1)), num(iso.group(2)), num(iso.group(3))), iso);
        }
        Matcher numbers = NUMBER_DATE.matcher(plain);
        while (numbers.find()) {
            int first = num(numbers.group(1));
            int second = num(numbers.group(3));
            int year = num(numbers.group(4));
            if (numbers.group(4).length() == 2) {
                year += 2000;
            }
            // Day first, unless that can't be: 11/25/2026 can only be 25 November.
            boolean monthFirst = second > 12 && first <= 12;
            add(found, monthFirst ? date(year, first, second) : date(year, second, first), numbers);
        }
        Matcher named = DAY_MONTH_NAME.matcher(plain);
        while (named.find()) {
            Integer month = MONTHS.get(named.group(2));
            if (month != null) {
                add(found, withYear(named.group(3), month, num(named.group(1)), today), named);
            }
        }
        Matcher american = MONTH_NAME_DAY.matcher(plain);
        while (american.find()) {
            Integer month = MONTHS.get(american.group(1));
            if (month != null) {
                add(found, withYear(american.group(3), month, num(american.group(2)), today), american);
            }
        }
        Matcher short_ = DAY_MONTH.matcher(plain);
        while (short_.find()) {
            add(found, withYear(null, num(short_.group(2)), num(short_.group(1)), today), short_);
        }
        found.sort(Comparator.comparingInt(DateIn::start));
        return found;
    }

    private static void add(List<DateIn> found, LocalDate date, Matcher at) {
        boolean overlaps = found.stream().anyMatch(d -> at.start() < d.end() && d.start() < at.end());
        if (date != null && !overlaps) {
            found.add(new DateIn(date, at.start(), at.end()));
        }
    }

    private static int num(String digits) {
        return Integer.parseInt(digits);
    }

    private static LocalDate date(int year, int month, int day) {
        try {
            return year < 2000 || year > 2100 ? null : LocalDate.of(year, month, day);
        } catch (DateTimeException notADate) {
            return null;
        }
    }

    /** A date with no year is the next time that day comes; one from the last two months is still this year's. */
    private static LocalDate withYear(String year, int month, int day, LocalDate today) {
        if (year != null) {
            return date(num(year), month, day);
        }
        LocalDate thisYear = date(today.getYear(), month, day);
        if (thisYear == null) {
            return null;
        }
        return thisYear.isBefore(today.minusDays(60)) ? date(today.getYear() + 1, month, day) : thisYear;
    }

    private static Found<LocalDate> due(List<Line> lines, LocalDate today) {
        for (int i = 0; i < lines.size(); i++) {
            Line line = lines.get(i);
            int word = where(line.plain(), DUE);
            if (word < 0) {
                continue;
            }
            List<DateIn> here = dates(line.plain(), today);
            // The date that follows the word, or failing that the one before it on the same line.
            DateIn date = here.stream()
                    .filter(d -> d.start() >= word)
                    .findFirst()
                    .orElse(here.isEmpty() ? null : here.get(0));
            if (date != null) {
                return new Found<>(date.date(), line.text(), line.number());
            }
            // "Due date:" on one line and the date on the next.
            boolean nothingElse = line.plain().substring(word).chars().noneMatch(Character::isDigit);
            if (nothingElse && i + 1 < lines.size()) {
                List<DateIn> next = dates(lines.get(i + 1).plain(), today);
                if (!next.isEmpty()) {
                    return new Found<>(
                            next.get(0).date(),
                            lines.get(i + 1).text(),
                            lines.get(i + 1).number());
                }
            }
        }
        return null;
    }

    // ---------- the amount ----------

    private static Money amount(List<Line> lines, LocalDate today) {
        Money best = null;
        int carried = 0;
        for (Line line : lines) {
            int words = wordScore(line.plain());
            String masked = mask(line, today);
            List<Money> here = new ArrayList<>();
            Matcher m = AMOUNT.matcher(masked);
            while (m.find()) {
                String after = masked.substring(m.end());
                if (UNIT_AFTER.matcher(after).find()) {
                    continue;
                }
                Matcher before = CURRENCY_BEFORE.matcher(masked.substring(0, m.start()));
                Matcher behind = CURRENCY_AFTER.matcher(after);
                String currency = before.find() ? before.group(1) : behind.find() ? behind.group(1) : null;
                boolean cents = m.group(2) != null && m.group(2).length() == 2;
                String whole = m.group(1).replaceAll("\\D", "");
                if (whole.length() > 9) {
                    continue;
                }
                long value = Long.parseLong(whole) * 100
                        + (m.group(2) == null ? 0 : m.group(2).length() == 1 ? num(m.group(2)) * 10L : num(m.group(2)));
                int lineScore = words != 0 ? words : carried;
                // A number on a line about tax, a subtotal or change is never what to pay. A bare number is only
                // an amount when the line says so, or when it carries a currency or cents.
                if (value <= 0 || lineScore < 0 || !(currency != null || cents || lineScore >= 100)) {
                    continue;
                }
                here.add(new Money(
                        value,
                        currency == null ? null : currencyCode(currency),
                        lineScore + (currency != null ? 20 : 0) + (cents ? 10 : 0),
                        line));
            }
            for (Money money : here) {
                if (best == null
                        || money.score() > best.score()
                        || (money.score() == best.score() && money.cents() > best.cents())) {
                    best = money;
                }
            }
            // "Amount due:" on one line and the number on the next.
            carried = here.isEmpty() && words > 0 ? words : 0;
        }
        if (best == null) {
            return null;
        }
        return new Money(
                best.cents(),
                best.currency() != null ? best.currency() : currencyAnywhere(lines),
                best.score(),
                best.line());
    }

    /** What a line's words say about the number on it: 100 for "this is what to pay", 50 for a total, below zero for tax and change. */
    private static int wordScore(String plain) {
        if (has(plain, PAY_THIS)) {
            return 100;
        }
        return (has(plain, A_TOTAL) ? 50 : 0) + (has(plain, NOT_THIS) ? -70 : 0);
    }

    /** The line with its dates, IBAN and reference blanked out, so their digits aren't taken for amounts. */
    private static String mask(Line line, LocalDate today) {
        char[] masked = line.plain().toCharArray();
        List<Span> spans = new ArrayList<>();
        dates(line.plain(), today).forEach(d -> spans.add(new Span(d.start(), d.end())));
        String upper = line.text().toUpperCase(Locale.ROOT);
        if (upper.length() == masked.length) {
            Span iban = ibanIn(upper);
            if (iban != null) {
                spans.add(iban);
            }
            for (Pattern pattern : List.of(RF_REFERENCE, SI_REFERENCE)) {
                Matcher m = pattern.matcher(upper);
                while (m.find()) {
                    spans.add(new Span(m.start(), m.end()));
                }
            }
        }
        int word = where(line.plain(), REFERENCE);
        if (word < 0) {
            word = where(line.plain(), INVOICE_NUMBER);
        }
        if (word >= 0) {
            spans.add(new Span(word, masked.length));
        }
        for (Span span : spans) {
            for (int i = span.start(); i < span.end() && i < masked.length; i++) {
                masked[i] = '_';
            }
        }
        return new String(masked);
    }

    private static String currencyCode(String sign) {
        return switch (sign) {
            case "€", "eur" -> "EUR";
            case "$", "usd" -> "USD";
            case "£", "gbp" -> "GBP";
            default -> sign.toUpperCase(Locale.ROOT);
        };
    }

    private static final Pattern ANY_CURRENCY = Pattern.compile("(€|\\beur\\b|\\$|\\busd\\b|£|\\bgbp\\b|\\bchf\\b)");

    private static String currencyAnywhere(List<Line> lines) {
        for (Line line : lines) {
            Matcher m = ANY_CURRENCY.matcher(line.plain());
            if (m.find()) {
                return currencyCode(m.group(1));
            }
        }
        return Cash.EUR;
    }

    // ---------- the IBAN ----------

    private static Found<String> iban(List<Line> lines) {
        for (Line line : lines) {
            String upper = line.text().toUpperCase(Locale.ROOT);
            Span span = ibanIn(upper);
            if (span != null) {
                String compact = upper.substring(span.start(), span.end()).replace(" ", "");
                return new Found<>(compact.replaceAll("(.{4})(?=.)", "$1 "), line.text(), line.number());
            }
        }
        return null;
    }

    /** Where in a line (in capitals) an IBAN is: the longest run from a start like "SI56" that passes the check sum. */
    private static Span ibanIn(String upper) {
        Matcher start = IBAN_START.matcher(upper);
        while (start.find()) {
            StringBuilder compact = new StringBuilder();
            List<Integer> ends = new ArrayList<>();
            int i = start.start();
            while (i < upper.length() && compact.length() < 34) {
                char c = upper.charAt(i);
                if (c == ' '
                        && i + 1 < upper.length()
                        && isIbanChar(upper.charAt(i + 1))
                        && upper.charAt(i - 1) != ' ') {
                    i++;
                    continue;
                }
                if (!isIbanChar(c)) {
                    break;
                }
                compact.append(c);
                i++;
                ends.add(i);
            }
            if (compact.toString().startsWith("RF")) {
                continue; // an RF reference has the same check sum as an IBAN, and is not one
            }
            Integer known = IBAN_LENGTHS.get(compact.substring(0, 2));
            for (int length = compact.length(); length >= 15; length--) {
                if ((known == null || known == length) && validIban(compact.substring(0, length))) {
                    return new Span(start.start(), ends.get(length - 1));
                }
            }
        }
        return null;
    }

    private static boolean isIbanChar(char c) {
        return (c >= 'A' && c <= 'Z') || (c >= '0' && c <= '9');
    }

    /** The IBAN's own check: move the first four characters to the end, read letters as 10 to 35, and the number must leave 1 when divided by 97. */
    static boolean validIban(String compact) {
        if (compact.length() < 15 || compact.length() > 34) {
            return false;
        }
        String moved = compact.substring(4) + compact.substring(0, 4);
        int rest = 0;
        for (int i = 0; i < moved.length(); i++) {
            char c = moved.charAt(i);
            int value = c >= 'A' ? c - 'A' + 10 : c - '0';
            rest = (value > 9 ? rest * 100 + value : rest * 10 + value) % 97;
        }
        return rest == 1;
    }

    // ---------- the reference ----------

    private static Found<String> reference(List<Line> lines) {
        Found<String> best = null;
        int bestScore = 0;
        for (int i = 0; i < lines.size(); i++) {
            Line line = lines.get(i);
            String upper = line.text().toUpperCase(Locale.ROOT);
            boolean sameLength = upper.length() == line.plain().length();
            Span iban = sameLength ? ibanIn(upper) : null;
            String noIban = iban == null
                    ? upper
                    : upper.substring(0, iban.start())
                            + " ".repeat(iban.end() - iban.start())
                            + upper.substring(iban.end());
            int word = where(line.plain(), REFERENCE);
            String structured = null;
            // A line about the IBAN whose number doesn't pass the check is a misread IBAN, not a reference.
            boolean aboutTheIban = word < 0 && line.plain().contains("iban");
            for (Pattern pattern : List.of(RF_REFERENCE, SI_REFERENCE)) {
                Matcher m = pattern.matcher(noIban);
                if (structured == null && !aboutTheIban && m.find()) {
                    structured = m.group().replaceAll("\\s+", " ").strip();
                }
            }
            String value = null;
            int score = 0;
            if (structured != null) {
                value = structured;
                score = word >= 0 ? 100 : 60;
            } else if (word >= 0) {
                value = valueAfter(line, word, REFERENCE);
                score = 80;
                if (value == null
                        && i + 1 < lines.size()
                        && looksLikeReference(lines.get(i + 1).text())) {
                    value = lines.get(i + 1).text();
                    line = lines.get(i + 1);
                }
            } else {
                int invoice = where(line.plain(), INVOICE_NUMBER);
                if (invoice >= 0) {
                    value = valueAfter(line, invoice, INVOICE_NUMBER);
                    score = 40;
                }
            }
            if (value != null && score > bestScore) {
                best = new Found<>(value, line.text(), line.number());
                bestScore = score;
            }
        }
        return best;
    }

    /** What follows a word like "Reference" on its line, when it holds a digit: "Reference no.: 2026-118/4" gives "2026-118/4". */
    private static String valueAfter(Line line, int at, List<String> words) {
        String word = words.stream()
                .filter(w -> line.plain().startsWith(w, at))
                .max(Comparator.comparingInt(String::length))
                .orElse("");
        Matcher m = REFERENCE_VALUE.matcher(
                line.text().substring(Math.min(at + word.length(), line.text().length())));
        if (!m.find()) {
            return null;
        }
        String value = m.group(1).strip();
        return value.chars().anyMatch(Character::isDigit) ? value : null;
    }

    private static boolean looksLikeReference(String text) {
        return text.length() <= 35
                && text.matches("[\\p{L}\\d][\\p{L}\\d /-]+")
                && text.chars().anyMatch(Character::isDigit);
    }

    // ---------- who to pay ----------

    private static Known known(List<Line> lines) {
        for (Known known : KNOWN) {
            for (Line line : lines) {
                if (has(line.plain() + " ", known.words())) {
                    return known;
                }
            }
        }
        return null;
    }

    private static Found<String> payee(List<Line> lines, Known known) {
        // 1. A line that says who: "Prejemnik: Elektro Ljubljana d.d.", "From: Netflix <info@netflix.com>".
        for (int i = 0; i < lines.size(); i++) {
            Line line = lines.get(i);
            String said = saidToBeThePayee(line);
            if (said != null) {
                String name = name(said);
                if (!name.isEmpty()) {
                    return new Found<>(name, line.text(), line.number());
                }
                if (i + 1 < lines.size() && !name(lines.get(i + 1).text()).isEmpty()) {
                    Line next = lines.get(i + 1);
                    return new Found<>(name(next.text()), next.text(), next.number());
                }
            }
        }
        // 2. A subscription it knows by name.
        if (known != null && known.brand()) {
            for (Line line : lines) {
                if (has(line.plain() + " ", known.words())) {
                    return new Found<>(known.title(), line.text(), line.number());
                }
            }
        }
        // 3. The first line that names a company.
        for (Line line : lines) {
            Matcher company = COMPANY.matcher(line.text());
            if (company.find()) {
                String name = name(line.text().substring(0, company.end()));
                if (!name.isEmpty()) {
                    return new Found<>(name, line.text(), line.number());
                }
            }
        }
        // 4. The first line that looks like a name: letters, no sums, not about the paper itself.
        for (Line line : lines.subList(0, Math.min(lines.size(), 8))) {
            String plain = line.plain();
            long letters = plain.chars().filter(Character::isLetter).count();
            long digits = plain.chars().filter(Character::isDigit).count();
            if (letters >= 3
                    && digits <= 2
                    && plain.length() <= 48
                    && Character.isLetter(plain.charAt(0))
                    && !plain.contains("@")
                    && !hasWhole(plain, NOT_A_NAME)) {
                return new Found<>(name(line.text()), line.text(), line.number());
            }
        }
        return null;
    }

    /**
     * What a line says after "Payee:", "Pay to" or "From:": the rest of the line (empty when the name is on the
     * next one), or null when the line isn't naming who to pay.
     */
    private static String saidToBeThePayee(Line line) {
        String plain = line.plain();
        for (String from : List.of("from:", "od:", "von:", "de:")) {
            if (plain.startsWith(from)) {
                return line.text().substring(from.length());
            }
        }
        int at = where(plain, PAYEE);
        if (at < 0) {
            return null;
        }
        String word =
                PAYEE.stream().filter(w -> plain.startsWith(w, at)).findFirst().orElse("");
        String rest = line.text().substring(at + word.length());
        if (rest.isBlank() || rest.stripLeading().startsWith(":")) {
            return rest;
        }
        return word.endsWith(" to") || word.endsWith(" by") ? rest : null;
    }

    /** A name tidied up: no "Ltd" or "d.d.", no email address, no shouting. */
    private static String name(String raw) {
        String name = raw.replaceAll("<[^>]*>", " ").replaceAll("\\S+@\\S+", " ");
        Matcher company = COMPANY.matcher(name);
        if (company.find()) {
            name = name.substring(0, company.start());
        }
        name = name.replaceAll("^[\\s:,\"'“”.-]+", "")
                .replaceAll("[\\s:,\"'“”-]+$", "")
                .replaceAll("\\s+", " ");
        if (name.length() > 60) {
            name = name.substring(0, 60).strip();
        }
        boolean shouting = name.length() > 3
                && name.equals(name.toUpperCase(Locale.ROOT))
                && name.chars().anyMatch(Character::isLetter);
        if (shouting) {
            StringBuilder calm = new StringBuilder();
            for (String word : name.toLowerCase(Locale.ROOT).split(" ")) {
                calm.append(calm.isEmpty() ? "" : " ")
                        .append(Character.toUpperCase(word.charAt(0)))
                        .append(word.substring(1));
            }
            name = calm.toString();
        }
        return name.chars().filter(Character::isLetter).count() >= 2 ? name : "";
    }

    // ---------- how it comes round ----------

    private static final List<String> MONTHLY = List.of(
            "monthly",
            "every month",
            "per month",
            "/month",
            "/mo",
            "a month",
            "mesecn",
            "na mesec",
            "monatlich",
            "pro monat",
            "mensuel",
            "par mois",
            "mensual",
            "al mes",
            "mensile",
            "al mese",
            "maandelijks");
    private static final List<String> YEARLY = List.of(
            "yearly",
            "annual",
            "every year",
            "per year",
            "/year",
            "/yr",
            "a year",
            "next year",
            "for the year",
            "12 months",
            "letna narocnina",
            "jahrlich",
            "pro jahr",
            "annuel",
            "par an",
            "anual",
            "annuale");

    private static Found<Repeat> repeat(List<Line> lines, Known known) {
        // Electricity, rent and their like come every month, whatever the letter says about a year's use.
        boolean household = known != null && known.monthly() && !known.brand();
        if (!household) {
            for (Line line : lines) {
                if (has(line.plain(), YEARLY)) {
                    return new Found<>(Repeat.YEARLY, line.text(), line.number());
                }
                if (has(line.plain(), MONTHLY)) {
                    return new Found<>(Repeat.MONTHLY, line.text(), line.number());
                }
            }
        }
        if (known != null && known.monthly()) {
            for (Line line : lines) {
                if (has(line.plain() + " ", known.words())) {
                    return new Found<>(Repeat.MONTHLY, line.text(), line.number());
                }
            }
        }
        return null;
    }
}
