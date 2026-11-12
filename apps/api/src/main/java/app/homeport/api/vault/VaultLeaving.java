package app.homeport.api.vault;

import app.homeport.api.circle.Leaving;
import app.homeport.api.circle.MemberStore.MemberRow;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Component;

/**
 * When someone leaves a circle, the passwords they shared there stop working for the people who stay: every
 * other person's key to their items is erased and the items are theirs alone again. (The keys they held to
 * other people's items go the moment they are marked as gone; the database sees to that.)
 *
 * <p>What the others already saw or copied they keep: the app says "stops working", never "is forgotten".
 */
@Component
class VaultLeaving implements Leaving {

    private static final String THEIR_SHARED_ITEMS =
            "select t.id from things t where t.owner_id = :member and t.kind = 'vault_item' and t.audience <> 'me'";

    private final JdbcClient jdbc;

    VaultLeaving(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    @Override
    public int stops(MemberRow member) {
        return jdbc.sql("select count(*) from (" + THEIR_SHARED_ITEMS + ") shared")
                .param("member", member.id())
                .query(Integer.class)
                .single();
    }

    @Override
    public void left(MemberRow member) {
        jdbc.sql("delete from vault_grants where member_id <> :member and thing_id in (" + THEIR_SHARED_ITEMS + ")")
                .param("member", member.id())
                .update();
        jdbc.sql("delete from thing_shares where thing_id in (" + THEIR_SHARED_ITEMS + ")")
                .param("member", member.id())
                .update();
        jdbc.sql("delete from thing_hides where thing_id in (" + THEIR_SHARED_ITEMS + ")")
                .param("member", member.id())
                .update();
        jdbc.sql("update things set audience = 'me', updated_at = now() where owner_id = :member"
                        + " and kind = 'vault_item' and audience <> 'me'")
                .param("member", member.id())
                .update();
    }
}
