package app.homeport.api.seed;

/**
 * One part of the sample data that local mode starts with: the people of the screens, and what one place
 * keeps for them. Each place brings its own; they run in order, once, on an empty database.
 */
public interface Seeder {

    /** Lower runs first. The people and circles are 0; a place that builds on another runs after it. */
    int order();

    void seed(SeedWorld world);
}
