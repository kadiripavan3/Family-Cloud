package app.homeport.api.folder;

import app.homeport.api.circle.CircleKind;
import java.util.List;

/**
 * The spaces a circle's Notes begins with, by its kind. They are made once, the first time Notes is opened
 * there; after that they are ordinary spaces that can be renamed, shared differently or deleted.
 */
public final class StarterSpaces {

    private StarterSpaces() {}

    /** Who a starter space is shared with to begin with. */
    public enum For {
        EVERYONE,
        /** The adults of a family: a place for what the children needn't read yet. */
        GROWN_UPS
    }

    public record Starter(String name, String emoji, For audience) {}

    public static List<Starter> of(CircleKind kind) {
        return switch (kind) {
            case FAMILY ->
                List.of(
                        new Starter("Home", "🏠", For.EVERYONE),
                        new Starter("Kids", "🧒", For.GROWN_UPS),
                        new Starter("Trips", "✈️", For.EVERYONE));
            case COUPLE ->
                List.of(
                        new Starter("Our place", "🏡", For.EVERYONE),
                        new Starter("Money", "💰", For.EVERYONE),
                        new Starter("Trips", "✈️", For.EVERYONE),
                        new Starter("Someday", "🌍", For.EVERYONE));
            case FLAT ->
                List.of(
                        new Starter("The flat", "🏠", For.EVERYONE),
                        new Starter("Bills", "🧾", For.EVERYONE),
                        new Starter("Landlord", "🔑", For.EVERYONE));
            case CREW ->
                List.of(
                        new Starter("Trips", "✈️", For.EVERYONE),
                        new Starter("Plans", "📅", For.EVERYONE),
                        new Starter("The dictionary", "📚", For.EVERYONE));
            // One person for now: they make their own shelves.
            case SOLO -> List.of();
        };
    }
}
