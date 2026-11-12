package app.homeport.api.seed;

import java.util.Comparator;
import java.util.List;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Component;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * Local mode starts with the people of the screens: The Linds, Nora and Alex, Lisbon crew and the flat on
 * Trubarjeva, with what each place keeps for them. Added once, when the database is empty. Sign in as
 * nora@example.com (or alex@, kai@, lea@, lena@, ana@) with the test code to see them; any other address
 * starts empty, as a new person does.
 */
@Component
@ConditionalOnProperty(name = "homeport.seed.enabled", havingValue = "true")
class LocalSeed implements ApplicationRunner {

    private static final Logger log = LoggerFactory.getLogger(LocalSeed.class);

    private final SeedWorld world;
    private final List<Seeder> seeders;
    private final TransactionTemplate transaction;

    LocalSeed(SeedWorld world, List<Seeder> seeders, TransactionTemplate transaction) {
        this.world = world;
        this.seeders =
                seeders.stream().sorted(Comparator.comparingInt(Seeder::order)).toList();
        this.transaction = transaction;
    }

    @Override
    public void run(ApplicationArguments args) {
        boolean empty = world.jdbc()
                .sql("select not exists (select 1 from profiles)")
                .query(Boolean.class)
                .single();
        if (!empty) {
            return;
        }
        transaction.executeWithoutResult(status -> {
            world.jdbc().sql("set local statement_timeout = 0").update();
            seeders.forEach(seeder -> seeder.seed(world));
        });
        log.info("Sample data added: sign in as nora@example.com with the test code to see The Linds.");
    }
}
