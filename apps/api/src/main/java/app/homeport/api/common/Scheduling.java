package app.homeport.api.common;

import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Configuration;
import org.springframework.scheduling.annotation.EnableScheduling;

/**
 * Switches on the jobs that run by themselves (sending pushes, the weekly digest, reminders, tidying up).
 * They are on everywhere except in the tests, which call each job's work directly, at a moment of their own
 * choosing, so a job never changes data in the middle of a test.
 */
@Configuration
@EnableScheduling
@ConditionalOnProperty(name = "homeport.jobs.enabled", havingValue = "true", matchIfMissing = true)
class Scheduling {}
