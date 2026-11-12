package app.homeport.api.auth;

import app.homeport.api.account.AccountService;
import app.homeport.api.common.ApiProblem;
import app.homeport.api.profile.ProfileStore;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.util.UUID;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Lazy;
import org.springframework.web.servlet.HandlerInterceptor;
import org.springframework.web.servlet.config.annotation.InterceptorRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

/**
 * Someone can be signed in before they have a profile: that is what the sign-up steps are for. Until the
 * profile exists (and with it the confirmation that they are 13 or older) they may see who they are, upload their picture and save the profile, and nothing else: no reading, no writing. Every
 * other call is refused here with a clear answer, so no feature has to think about a person who is only half
 * there.
 *
 * <p>An account that was deleted stays deleted: a token that is still good for a little while gets the same
 * answer everywhere, and can't make a new profile.
 */
@Configuration
class ProfileGuard implements HandlerInterceptor, WebMvcConfigurer {

    private final ProfileStore profiles;
    private final AccountService accounts;

    ProfileGuard(ProfileStore profiles, @Lazy AccountService accounts) {
        this.profiles = profiles;
        this.accounts = accounts;
    }

    @Override
    public void addInterceptors(InterceptorRegistry registry) {
        registry.addInterceptor(this).addPathPatterns("/v1/**");
    }

    /** What the sign-up steps need before there is a profile. */
    private static boolean partOfSigningUp(HttpServletRequest request) {
        String path = request.getRequestURI().substring(request.getContextPath().length());
        return path.equals("/v1/me")
                || path.equals("/v1/me/profile")
                || path.equals("/v1/me/apple-sign-in")
                || path.startsWith("/v1/media/");
    }

    @Override
    public boolean preHandle(HttpServletRequest request, HttpServletResponse response, Object handler) {
        if (request.getMethod().equals("OPTIONS")) {
            return true;
        }
        CurrentUser who = MeResolver.current();
        UUID me = who.id();
        if (profiles.exists(me)) {
            return true;
        }
        if (accounts.wasDeleted(me, who.signedInAt())) {
            throw ApiProblem.unauthorized(
                    "account_deleted", "This account was deleted. Sign in again to start a new one.");
        }
        if (partOfSigningUp(request)) {
            return true;
        }
        throw ApiProblem.conflict("profile_required", "Finish setting up your profile first.");
    }
}
