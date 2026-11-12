package app.homeport.api.vault;

import app.homeport.api.activity.Askable;
import app.homeport.api.thing.ThingKind;
import java.util.UUID;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Component;

/**
 * Asking to see an item in the Vault. Someone an item is shared with can be unable to open it: their key
 * was for one look and that look has happened, it was shared until a moment that has passed, or the owner's
 * phone hasn't made their key yet. They know it exists (the one sharing rule shows them its title), so they
 * can ask its owner.
 */
@Component
class VaultAsks implements Askable {

    private final JdbcClient jdbc;

    VaultAsks(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    @Override
    public ThingKind kind() {
        return ThingKind.VAULT_ITEM;
    }

    @Override
    public String where() {
        return "in the Vault";
    }

    /** Shut unless they hold a key that is ready: there, not used up, and not stopped. */
    @Override
    public boolean shutFor(UUID thingId, UUID memberId) {
        return !jdbc.sql("""
            select exists (select 1 from vault_grants g where g.thing_id = :thing and g.member_id = :member
              and g.wrapped_key is not null and g.used_at is null and (g.stops_at is null or g.stops_at > now()))
            """)
                .param("thing", thingId)
                .param("member", memberId)
                .query(Boolean.class)
                .single();
    }
}
