package app.homeport.api.auth;

import java.lang.annotation.ElementType;
import java.lang.annotation.Retention;
import java.lang.annotation.RetentionPolicy;
import java.lang.annotation.Target;

/**
 * Marks a controller parameter that receives the signed-in person: {@code @Me UUID me} for their id, or
 * {@code @Me CurrentUser user} when the email is needed too. Filled in by {@link MeResolver}.
 */
@Target(ElementType.PARAMETER)
@Retention(RetentionPolicy.RUNTIME)
public @interface Me {}
