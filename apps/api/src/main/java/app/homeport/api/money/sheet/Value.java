package app.homeport.api.money.sheet;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

/**
 * What a cell holds, or what a formula works out to. A number knows whether it is money (then it is an amount
 * in whole units, 84.20, and becomes cents again when it is shown). An empty cell knows which column it is in,
 * so a formula that needs it can say "Price is empty". A problem is the sentence the cell shows in place of a
 * value.
 */
public sealed interface Value {

    record Num(BigDecimal amount, boolean money) implements Value {}

    record Text(String text) implements Value {}

    record Tick(boolean on) implements Value {}

    record Day(LocalDate date) implements Value {}

    /** The people in a person cell: their member ids, and their first names for comparing with "Alex". */
    record People(List<UUID> ids, List<String> names) implements Value {}

    record Empty(String column) implements Value {}

    record Problem(String says) implements Value {}

    Empty NOTHING = new Empty("");

    static Num number(long whole) {
        return new Num(BigDecimal.valueOf(whole), false);
    }

    static Num money(long cents) {
        return new Num(BigDecimal.valueOf(cents, 2), true);
    }
}
