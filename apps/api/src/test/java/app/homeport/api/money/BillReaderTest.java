package app.homeport.api.money;

import static org.assertj.core.api.Assertions.assertThat;

import app.homeport.api.money.BillReader.Found;
import app.homeport.api.money.BillReader.Reading;
import java.time.LocalDate;
import java.util.List;
import java.util.stream.Stream;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.junit.jupiter.params.provider.MethodSource;

/**
 * Reading a bill from its text, by rules: utility bills in several languages, a restaurant receipt, a
 * subscription email. Each text is what a phone reads off a photo or a PDF, line by line. "Today" is
 * Wednesday 11 November 2026, as on the screens.
 */
class BillReaderTest {

    private static final LocalDate TODAY = LocalDate.of(2026, 11, 11);

    /** A text and what should be read from it. Null means "nothing found". */
    record Paper(
            String name,
            String text,
            String payee,
            Long cents,
            String currency,
            String due,
            String iban,
            String reference) {

        @Override
        public String toString() {
            return name;
        }
    }

    private static Reading read(String text) {
        return BillReader.read(List.of(text.strip().split("\n")), TODAY);
    }

    private static <T> T value(Found<T> found) {
        return found == null ? null : found.value();
    }

    static Stream<Paper> papers() {
        return Stream.of(
                new Paper(
                        "the electricity bill of the screens, in Slovenian",
                        """
                        ELEKTRO LJUBLJANA d.d.
                        Slovenska cesta 58, 1516 Ljubljana
                        Račun št. 2026-118432
                        Datum izdaje: 28.10.2026
                        Poraba: 312 kWh
                        Osnova za DDV: 69,02 EUR
                        DDV 22 %: 15,18 EUR
                        Za plačilo: 84,20 EUR
                        Rok plačila: 12.11.2026
                        IBAN: SI56 2633 0001 2039 086
                        Sklic: SI12 3456 7890 1184
                        """,
                        "Elektro Ljubljana",
                        8420L,
                        "EUR",
                        "2026-11-12",
                        "SI56 2633 0001 2039 086",
                        "SI12 3456 7890 1184"),
                new Paper(
                        "a water bill in English, in pounds",
                        """
                        Thames Water Utilities Ltd
                        Your water bill
                        Bill date: 3 November 2026
                        Charges this period £61.40
                        Previous balance £0.00
                        Total amount due £61.40
                        Please pay by 24 November 2026
                        Payment reference: 4471 2026 1184
                        """,
                        "Thames Water Utilities",
                        6140L,
                        "GBP",
                        "2026-11-24",
                        null,
                        "4471 2026 1184"),
                new Paper(
                        "an electricity bill in German",
                        """
                        Stadtwerke München GmbH
                        Rechnung Nr. 2026-554120
                        Rechnungsdatum: 02.11.2026
                        Stromverbrauch 286 kWh
                        Nettobetrag 71,35 €
                        MwSt. 19 % 13,56 €
                        Rechnungsbetrag 84,91 €
                        Zahlbar bis 16.11.2026
                        IBAN: DE89 3704 0044 0532 0130 00
                        Verwendungszweck: 2026-554120
                        """,
                        "Stadtwerke München",
                        8491L,
                        "EUR",
                        "2026-11-16",
                        "DE89 3704 0044 0532 0130 00",
                        "2026-554120"),
                new Paper("a restaurant receipt", """
                        CERVEJARIA RAMIRO
                        Av. Almirante Reis 1, Lisboa
                        Mesa 12   01/11/2026 21:40
                        2 x Gambas à guilho   31,00
                        1 x Sapateira         48,50
                        5 x Imperial          12,50
                        Pão e manteiga         6,00
                        Subtotal             98,00
                        IVA 13%              12,74
                        TOTAL               186,00 EUR
                        Multibanco          186,00
                        Obrigado!
                        """, "Cervejaria Ramiro", 18600L, "EUR", null, null, null),
                new Paper("a subscription email", """
                        From: Netflix <info@account.netflix.com>
                        Subject: Your Netflix membership
                        Hi Nora,
                        Your membership renews soon.
                        Plan: Standard
                        Price: €13.99 a month
                        Next billing date: 20 November 2026
                        """, "Netflix", 1399L, "EUR", "2026-11-20", null, null),
                new Paper(
                        "an American invoice, month first and in dollars",
                        """
                        ACME Hosting, Inc.
                        Invoice #INV-20391
                        Invoice Date: 11/01/2026
                        Due Date: 11/25/2026
                        Web hosting (annual)        $120.00
                        Sales Tax                     $9.60
                        Amount Due                  $129.60
                        """,
                        "ACME Hosting",
                        12960L,
                        "USD",
                        "2026-11-25",
                        null,
                        "INV-20391"),
                new Paper("an electricity bill in French", """
                        EDF SA
                        Facture n° 7754120
                        Date de facture : 28/10/2026
                        Montant HT : 52,10 €
                        TVA 20 % : 10,42 €
                        Total TTC : 62,52 €
                        Net à payer avant le 15/11/2026 : 62,52 €
                        """, "EDF", 6252L, "EUR", "2026-11-15", null, "7754120"),
                new Paper(
                        "an electricity bill in Spanish",
                        """
                        Iberdrola Clientes S.A.U.
                        Factura de electricidad
                        Fecha de emisión: 05/11/2026
                        Importe total: 73,18 €
                        Fecha límite de pago: 20/11/2026
                        IBAN ES91 2100 0418 4502 0005 1332
                        """,
                        "Iberdrola Clientes",
                        7318L,
                        "EUR",
                        "2026-11-20",
                        "ES91 2100 0418 4502 0005 1332",
                        null),
                new Paper(
                        "an electricity bill in Italian", """
                        Enel Energia S.p.A.
                        Bolletta luce
                        Totale da pagare 58,30 €
                        Scadenza 18/11/2026
                        """, "Enel Energia", 5830L, "EUR", "2026-11-18", null, null),
                new Paper(
                        "an energy bill in Dutch",
                        """
                        Vattenfall Klantenservice B.V.
                        Factuurnummer: 8812345
                        Te betalen: € 91,05
                        Vervaldatum: 21-11-2026
                        IBAN: NL91 ABNA 0417 1643 00
                        """,
                        "Vattenfall Klantenservice",
                        9105L,
                        "EUR",
                        "2026-11-21",
                        "NL91 ABNA 0417 1643 00",
                        "8812345"),
                new Paper(
                        "a builder's invoice with a dot for thousands and a comma for cents",
                        """
                        Obnova d.o.o.
                        Račun 14/2026
                        Skupaj brez DDV 1.020,00 EUR
                        DDV 22% 224,40 EUR
                        Skupaj za plačilo 1.244,40 EUR
                        Rok plačila 30. 11. 2026
                        """,
                        "Obnova",
                        124440L,
                        "EUR",
                        "2026-11-30",
                        null,
                        null),
                new Paper(
                        "a roofer's invoice with a comma for thousands and a dot for cents",
                        """
                        Brightside Roofing LLC
                        Invoice No. 2207
                        Total Due: $1,234.56
                        Due: Dec 1, 2026
                        """,
                        "Brightside Roofing",
                        123456L,
                        "USD",
                        "2026-12-01",
                        null,
                        "2207"),
                new Paper(
                        "a Swiss bill with an apostrophe for thousands",
                        """
                        Swisscom (Schweiz) AG
                        Rechnungsbetrag CHF 1'204.50
                        Zahlbar bis 30.11.2026
                        IBAN CH93 0076 2011 6238 5295 7
                        """,
                        "Swisscom (Schweiz)",
                        120450L,
                        "CHF",
                        "2026-11-30",
                        "CH93 0076 2011 6238 5295 7",
                        null),
                new Paper(
                        "a garage's bill with a space for thousands",
                        """
                        Škoda Servis Novak s.p.
                        Znesek za plačilo: 1 480,00 €
                        Rok plačila: 25.11.2026
                        Sklic: SI00 2026-1184
                        """,
                        "Škoda Servis Novak",
                        148000L,
                        "EUR",
                        "2026-11-25",
                        null,
                        "SI00 2026-1184"),
                new Paper(
                        "a bill with the amount and the date on the line after their labels",
                        """
                        Vodovod Kanalizacija Snaga d.o.o.
                        Amount due
                        € 31,40
                        Due date
                        15.11.2026
                        """,
                        "Vodovod Kanalizacija Snaga",
                        3140L,
                        "EUR",
                        "2026-11-15",
                        null,
                        null),
                new Paper(
                        "a café receipt with no word for the total",
                        """
                        Bar Pri Zelenem Zmaju
                        Kava 2x            3,60 €
                        Sok                2,80 €
                        Rogljiček          1,90 €
                                           8,30 €
                        """,
                        "Bar Pri Zelenem Zmaju",
                        830L,
                        "EUR",
                        null,
                        null,
                        null),
                new Paper(
                        "a parking ticket with a round amount",
                        """
                        Parkhaus Zentrum
                        Total EUR 12
                        Danke für Ihren Besuch
                        """,
                        "Parkhaus Zentrum",
                        1200L,
                        "EUR",
                        null,
                        null,
                        null),
                new Paper(
                        "a gym's reminder with a two-digit year",
                        """
                        City Gym
                        Membership fee: 45.00 EUR
                        Pay before 05/12/26
                        """,
                        "City Gym",
                        4500L,
                        "EUR",
                        "2026-12-05",
                        null,
                        null),
                new Paper(
                        "an insurance premium with the month written out in Slovenian",
                        """
                        Zavarovalnica Triglav, d.d.
                        Polica št. 0912345
                        Letna premija: 369,00 EUR
                        Zapade v plačilo 1. decembra 2026
                        """,
                        "Zavarovalnica Triglav",
                        36900L,
                        "EUR",
                        "2026-12-01",
                        null,
                        null),
                new Paper(
                        "an internet bill whose due date has no year",
                        """
                        Kabel Plus
                        Internet 100/20
                        Znesek: 39,90 €
                        Rok plačila: 18.11.
                        """,
                        "Kabel Plus",
                        3990L,
                        "EUR",
                        "2026-11-18",
                        null,
                        null),
                new Paper(
                        "a payment slip that names the payee last",
                        """
                        UPN QR
                        Plačnik: Nora Lind, Glinška 3, Ljubljana
                        Namen: Vrtec november
                        Znesek: ***120,00 EUR
                        Rok plačila: 18.11.2026
                        IBAN prejemnika: SI56 2633 0001 2039 086
                        Sklic: SI12 2026-11-0087
                        Prejemnik: Vrtec Viški gaj
                        """,
                        "Vrtec Viški gaj",
                        12000L,
                        "EUR",
                        "2026-11-18",
                        "SI56 2633 0001 2039 086",
                        "SI12 2026-11-0087"),
                new Paper(
                        "a dentist's bill with the payee on the line after its label",
                        """
                        Payee
                        Riverside Dental Practice
                        Amount: £85.00
                        Pay by: 30/11/2026
                        Ref: RDP-20443
                        """,
                        "Riverside Dental Practice",
                        8500L,
                        "GBP",
                        "2026-11-30",
                        null,
                        "RDP-20443"),
                new Paper(
                        "a Finnish bill: no words it knows, but an RF reference and an IBAN",
                        """
                        Helsingin Energia Oy
                        Lasku
                        Yhteensä 54,20 EUR
                        Eräpäivä 25.11.2026
                        Viite RF18 5390 0754 7034
                        IBAN FI21 1234 5600 0007 85
                        """,
                        "Helsingin Energia",
                        5420L,
                        "EUR",
                        null,
                        "FI21 1234 5600 0007 85",
                        "RF18 5390 0754 7034"),
                new Paper(
                        "a music school's bill with the IBAN written without spaces, before the BIC",
                        """
                        Musikschule Klangfarbe e.V.
                        Beitrag November: 48,00 EUR
                        Fällig am 15.11.2026
                        Bankverbindung: IBAN DE89370400440532013000 BIC COBADEFFXXX
                        """,
                        "Musikschule Klangfarbe e.V.",
                        4800L,
                        "EUR",
                        "2026-11-15",
                        "DE89 3704 0044 0532 0130 00",
                        null),
                new Paper(
                        "a doctor's bill with the currency as letters before the amount",
                        """
                        Dr. A. Patel — Private Practice
                        Consultation 14 Oct 2026
                        Balance due: GBP 140.00
                        Payable by 28 Nov 2026
                        """,
                        "Dr. A. Patel — Private Practice",
                        14000L,
                        "GBP",
                        "2026-11-28",
                        null,
                        null),
                new Paper("an email about a yearly plan", """
                        From: Dropbox <no-reply@dropbox.com>
                        Your Dropbox Plus plan renews on 3 December 2026.
                        You will be charged €119.88 for the next year.
                        """, "Dropbox", 11988L, "EUR", "2026-12-03", null, null),
                new Paper(
                        "a receipt for a subscription",
                        """
                        Spotify
                        Receipt
                        Order number: 2219-8841-0033
                        Spotify Premium Family
                        Total: €17.99
                        Payment method: Visa ending 4421
                        Your next billing date is 14/12/2026.
                        """,
                        "Spotify",
                        1799L,
                        "EUR",
                        "2026-12-14",
                        null,
                        "2219-8841-0033"),
                new Paper(
                        "a phone bill with the total given with and without tax",
                        """
                        A1 Slovenija, d. d.
                        Mobilni paket: 24,99
                        Dodatne storitve: 3,00
                        Total excl. VAT: 22,94 EUR
                        VAT 22%: 5,05 EUR
                        Total incl. VAT: 27,99 EUR
                        Due date: 20.11.2026
                        Reference: SI12 0000123456789
                        """,
                        "A1 Slovenija",
                        2799L,
                        "EUR",
                        "2026-11-20",
                        null,
                        "SI12 0000123456789"),
                new Paper(
                        "a landlord's letter",
                        """
                        Mr J. Novak
                        Glinška ulica 3, 1000 Ljubljana
                        Najemnina za december 2026
                        Znesek: 980,00 EUR
                        Plačati do: 16.12.2026
                        TRR: SI56 1910 0000 0123 438
                        """,
                        "Mr J. Novak",
                        98000L,
                        "EUR",
                        "2026-12-16",
                        "SI56 1910 0000 0123 438",
                        null),
                new Paper("a hotel bill that was paid by card", """
                        Hotel Lev d.d.
                        Folio 88213
                        Room 2 nights           EUR 298.00
                        City tax                EUR 6.26
                        Total                   EUR 304.26
                        Paid by card            EUR 304.26
                        """, "Hotel Lev", 30426L, "EUR", null, null, null),
                new Paper(
                        "a nursery's letter with the date in words",
                        """
                        Little Acorns Nursery
                        Fees for November
                        Total to pay: £412.00
                        Please pay by the 5th of December 2026
                        """,
                        "Little Acorns Nursery",
                        41200L,
                        "GBP",
                        "2026-12-05",
                        null,
                        null),
                new Paper(
                        "a yearly insurance premium in German",
                        """
                        Generali Versicherung AG
                        Haushaltsversicherung
                        Jahresprämie: 214,60 EUR pro Jahr
                        Fällig: 01.12.2026
                        Zahlungsreferenz: 000123456789
                        """,
                        "Generali Versicherung",
                        21460L,
                        "EUR",
                        "2026-12-01",
                        null,
                        "000123456789"),
                new Paper(
                        "a water bill with an old balance of nothing and a discount",
                        """
                        JP VOKA SNAGA d.o.o.
                        Poraba vode: 12 m3
                        Prejšnji dolg: 0,00 EUR
                        Popust: 2,00 EUR
                        Znesek za plačilo: 31,40 EUR
                        Rok plačila: 18. 11. 2026
                        """,
                        "Jp Voka Snaga",
                        3140L,
                        "EUR",
                        "2026-11-18",
                        null,
                        null),
                new Paper(
                        "a statement with a balance brought forward",
                        """
                        Greenfield Energy Limited
                        Statement
                        Balance forward        £12.10
                        New charges            £48.25
                        Amount due             £60.35
                        Due on 02/12/2026
                        Customer reference 9981 2271
                        """,
                        "Greenfield Energy",
                        6035L,
                        "GBP",
                        "2026-12-02",
                        null,
                        "9981 2271"),
                new Paper(
                        "a rent demand in German with the month written out",
                        """
                        Hausverwaltung Berger GmbH
                        Miete Dezember
                        Gesamtbetrag: 1.150,00 €
                        Fällig am 1. Dezember 2026
                        IBAN: AT61 1904 3002 3457 3201
                        """,
                        "Hausverwaltung Berger",
                        115000L,
                        "EUR",
                        "2026-12-01",
                        "AT61 1904 3002 3457 3201",
                        null),
                new Paper(
                        "a club's fee with an IBAN that was misread by one digit",
                        """
                        Tennis Club Park
                        Members fee 2026: 90,00 EUR
                        IBAN: SI56 1910 0000 0123 439
                        """,
                        "Tennis Club Park",
                        9000L,
                        "EUR",
                        null,
                        null,
                        null),
                new Paper(
                        "a Belgian phone bill",
                        """
                        Proximus NV
                        Totaal te betalen: 54,99 EUR
                        Vervaldatum: 28/11/2026
                        IBAN: BE68 5390 0754 7034
                        """,
                        "Proximus",
                        5499L,
                        "EUR",
                        "2026-11-28",
                        "BE68 5390 0754 7034",
                        null),
                new Paper(
                        "a supermarket receipt with no currency on it",
                        """
                        Pingo Doce
                        Rua Augusta 12
                        Arroz 1,29
                        Azeite 6,49
                        Total a pagar 7,78
                        """,
                        "Pingo Doce",
                        778L,
                        "EUR",
                        null,
                        null,
                        null),
                new Paper(
                        "a receipt with the currency as letters after the amount",
                        """
                        Notion Labs, Inc.
                        Receipt #2207-1184
                        Team plan (monthly)
                        Amount paid 16.00 USD
                        """,
                        "Notion Labs",
                        1600L,
                        "USD",
                        null,
                        null,
                        null),
                new Paper(
                        "a market stall's note with one digit after the comma",
                        """
                        Čebelarstvo Kovač
                        Med 2 kg
                        Skupaj 18,5 €
                        """,
                        "Čebelarstvo Kovač",
                        1850L,
                        "EUR",
                        null,
                        null,
                        null),
                new Paper(
                        "a Croatian electricity bill",
                        """
                        HEP Elektra d.o.o.
                        Iznos za plaćanje: 47,12 EUR
                        Datum dospijeća: 25.11.2026.
                        IBAN: HR12 1001 0051 8630 0016 0
                        Poziv na broj: HR01 2026-118-4
                        """,
                        "HEP Elektra",
                        4712L,
                        "EUR",
                        "2026-11-25",
                        "HR12 1001 0051 8630 0016 0",
                        "HR01 2026-118-4"),
                new Paper(
                        "a heating bill with two dates on one line",
                        """
                        Energetika Ljubljana d.o.o.
                        Obračunsko obdobje: 01.10.2026 - 31.10.2026
                        Ogrevanje: 101,00 EUR
                        Datum računa 05.11.2026, rok plačila 20.11.2026
                        """,
                        "Energetika Ljubljana",
                        10100L,
                        "EUR",
                        "2026-11-20",
                        null,
                        null),
                new Paper(
                        "an email that says when the card is charged",
                        """
                        Hi Nora,
                        Thanks for being a member of Audible.
                        Your card will be charged £7.99 on 1 December 2026.
                        """,
                        "Audible",
                        799L,
                        "GBP",
                        "2026-12-01",
                        null,
                        null),
                new Paper("a slip with nothing on it but tax", """
                        Receipt
                        VAT 22%: 4,40 EUR
                        """, null, null, "EUR", null, null, null),
                new Paper("a thank-you note", """
                        Thank you for your visit
                        See you again soon
                        """, null, null, "EUR", null, null, null));
    }

    @ParameterizedTest(name = "{0}")
    @MethodSource("papers")
    void readsWhoToPayHowMuchByWhenTheIbanAndTheReference(Paper paper) {
        Reading reading = read(paper.text());

        assertThat(value(reading.payee())).as("who to pay").isEqualTo(paper.payee());
        assertThat(value(reading.amountCents())).as("the amount, in cents").isEqualTo(paper.cents());
        assertThat(reading.currency()).as("the currency").isEqualTo(paper.currency());
        assertThat(value(reading.dueOn()))
                .as("the day it is due")
                .isEqualTo(paper.due() == null ? null : LocalDate.parse(paper.due()));
        assertThat(value(reading.iban())).as("the IBAN").isEqualTo(paper.iban());
        assertThat(value(reading.reference())).as("the reference").isEqualTo(paper.reference());
    }

    @Test
    void thereAreAtLeastFortyTextsItIsCheckedAgainst() {
        assertThat(papers().count()).isGreaterThanOrEqualTo(40);
    }

    @ParameterizedTest(name = "{0} is {1} cents")
    @CsvSource(
            delimiter = '|',
            quoteCharacter = '"',
            value = {
                "Total: 84,20 € | 8420",
                "Total: 84.20 € | 8420",
                "Total: € 84,20 | 8420",
                "Total: €84 | 8400",
                "Total: 1.234,56 € | 123456",
                "Total: 1,234.56 € | 123456",
                "Total: 1 234,56 € | 123456",
                "Total: 1'234.56 CHF | 123456",
                "Total: 12.345.678,90 EUR | 1234567890",
                "Total: 0,99 EUR | 99",
                "Total: 7,5 EUR | 750",
                "Total: 1.234 € | 123400",
                "Total: EUR 2,500 | 250000",
                "Total: 84,20EUR | 8420",
            })
    void readsADotOrACommaAsTheDecimalMarkWhicheverComesLast(String line, long cents) {
        assertThat(value(read("Shop\n" + line).amountCents())).isEqualTo(cents);
    }

    @ParameterizedTest(name = "\"{0}\" is {1}")
    @CsvSource(
            delimiter = '|',
            value = {
                "12.11.2026 | 2026-11-12",
                "12. 11. 2026 | 2026-11-12",
                "12/11/2026 | 2026-11-12",
                "12-11-2026 | 2026-11-12",
                "2026-11-12 | 2026-11-12",
                "12.11.26 | 2026-11-12",
                "12 Nov 2026 | 2026-11-12",
                "12 November 2026 | 2026-11-12",
                "12th November 2026 | 2026-11-12",
                "12. novembra 2026 | 2026-11-12",
                "12 novembre 2026 | 2026-11-12",
                "November 12, 2026 | 2026-11-12",
                "Nov 12 2026 | 2026-11-12",
                "3.12.2026 | 2026-12-03",
                "03/12/2026 | 2026-12-03",
                "11/25/2026 | 2026-11-25",
                "12.11. | 2026-11-12",
                "12 November | 2026-11-12",
                "15.1. | 2027-01-15",
                "1 March | 2027-03-01",
                "20.10. | 2026-10-20",
            })
    void readsDatesDayFirstAndADateWithoutAYearAsTheNextTimeThatDayComes(String written, LocalDate day) {
        assertThat(value(read("Shop\nDue: " + written).dueOn())).isEqualTo(day);
    }

    @Test
    void aDateThatIsNoDayIsNotRead() {
        assertThat(read("Shop\nDue: 31.02.2026").dueOn()).isNull();
        assertThat(read("Shop\nDue: 45.11.2026").dueOn()).isNull();
        // Only a date on a line that says when: an invoice date is not a due date.
        assertThat(read("Shop\nInvoice date: 02.11.2026\nTotal: 5,00 €").dueOn())
                .isNull();
    }

    @ParameterizedTest
    @CsvSource({
        "DE89370400440532013000, true",
        "GB82WEST12345698765432, true",
        "FR1420041010050500013M02606, true",
        "IT60X0542811101000000123456, true",
        "SI56263300012039086, true",
        "SI56263300012039087, false",
        "DE89370400440532013001, false",
        "XX00, false",
    })
    void anIbanIsOnlyOneWhenItsCheckSumIsRight(String iban, boolean valid) {
        assertThat(BillReader.validIban(iban)).isEqualTo(valid);
        assertThat(read("Shop\nIBAN: " + iban).iban() != null).isEqualTo(valid);
    }

    @Test
    void anIbanIsFoundWhereverItStandsAndWrittenInGroupsOfFour() {
        assertThat(value(read("Please transfer to GB82 WEST 1234 5698 7654 32 within 14 days")
                        .iban()))
                .isEqualTo("GB82 WEST 1234 5698 7654 32");
        assertThat(value(read("iban: fr14 2004 1010 0505 0001 3m02 606").iban()))
                .isEqualTo("FR14 2004 1010 0505 0001 3M02 606");
        assertThat(value(read("IBAN IT60X0542811101000000123456 Banca").iban()))
                .isEqualTo("IT60 X054 2811 1010 0000 0123 456");
    }

    @Test
    void everythingItReadsSaysWhichLineItCameFrom() {
        Reading reading = read("""
                ELEKTRO LJUBLJANA d.d.
                Za plačilo: 84,20 EUR
                Rok plačila: 12.11.2026
                IBAN: SI56 2633 0001 2039 086
                Sklic: SI12 3456 7890 1184
                """);

        assertThat(reading.payee().lineNumber()).isZero();
        assertThat(reading.payee().line()).isEqualTo("ELEKTRO LJUBLJANA d.d.");
        assertThat(reading.amountCents().lineNumber()).isEqualTo(1);
        assertThat(reading.amountCents().line()).isEqualTo("Za plačilo: 84,20 EUR");
        assertThat(reading.dueOn().lineNumber()).isEqualTo(2);
        assertThat(reading.iban().lineNumber()).isEqualTo(3);
        assertThat(reading.reference().lineNumber()).isEqualTo(4);
        assertThat(reading.reference().line()).isEqualTo("Sklic: SI12 3456 7890 1184");
    }

    @Test
    void itGuessesWhatTheBillIsAndHowItComesRound() {
        Reading electricity =
                read("Elektro Ljubljana d.d.\nPoraba: 312 kWh\nLetna poraba 3.900 kWh\nZa plačilo: 84,20 EUR");
        assertThat(electricity.title()).isEqualTo("Electricity");
        assertThat(electricity.emoji()).isEqualTo("⚡");
        assertThat(value(electricity.repeat())).isEqualTo(Repeat.MONTHLY);

        Reading netflix = read("From: Netflix <info@netflix.com>\nPrice: €13.99 a month");
        assertThat(netflix.title()).isEqualTo("Netflix");
        assertThat(value(netflix.repeat())).isEqualTo(Repeat.MONTHLY);
        assertThat(netflix.repeat().line()).isEqualTo("Price: €13.99 a month");

        Reading dropbox = read("Dropbox\nYou will be charged €119.88 for the next year.");
        assertThat(value(dropbox.repeat())).isEqualTo(Repeat.YEARLY);

        Reading insurance = read("Generali Versicherung AG\nJahresprämie: 214,60 EUR pro Jahr");
        assertThat(insurance.title()).isEqualTo("Insurance");
        assertThat(value(insurance.repeat())).isEqualTo(Repeat.YEARLY);

        // Nothing it knows: called after who is paid, and it doesn't guess how it comes round.
        Reading dentist = read("Riverside Dental Practice\nAmount: £85.00");
        assertThat(dentist.title()).isEqualTo("Riverside Dental Practice");
        assertThat(dentist.emoji()).isEqualTo("🧾");
        assertThat(dentist.repeat()).isNull();
    }

    @Test
    void numbersThatAreNotAmountsAreLeftAlone() {
        // A meter reading, a phone number, a percentage, a quantity and a year are not what to pay.
        Reading reading = read("""
                Komunala Kranj d.o.o.
                Tel: 04 281 13 00
                Stanje števca: 48213
                Poraba 18 m3, 22 % DDV
                Leto 2026
                3 x 4,50
                Za plačilo 13,50 EUR
                """);

        assertThat(value(reading.amountCents())).isEqualTo(1350);
        assertThat(reading.amountCents().line()).isEqualTo("Za plačilo 13,50 EUR");
    }

    @Test
    void nothingToReadGivesNothingBack() {
        Reading reading = BillReader.read(List.of("", "   ", "…"), TODAY);

        assertThat(reading.payee()).isNull();
        assertThat(reading.amountCents()).isNull();
        assertThat(reading.dueOn()).isNull();
        assertThat(reading.iban()).isNull();
        assertThat(reading.reference()).isNull();
        assertThat(reading.repeat()).isNull();
        assertThat(reading.title()).isEmpty();
    }
}
