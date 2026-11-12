package app.homeport.api.page;

import app.homeport.api.guest.GuestView;
import app.homeport.api.thing.ThingKind;
import java.util.UUID;
import org.springframework.stereotype.Component;

/** A guest reads a page's words. */
@Component
class PageGuestView implements GuestView {

    private final PageStore pages;

    PageGuestView(PageStore pages) {
        this.pages = pages;
    }

    @Override
    public ThingKind kind() {
        return ThingKind.PAGE;
    }

    @Override
    public Card show(UUID thingId) {
        return new Card("Page", pages.body(thingId).orElse(""));
    }
}
