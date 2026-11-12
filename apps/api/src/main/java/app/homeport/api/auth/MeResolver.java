package app.homeport.api.auth;

import app.homeport.api.common.ApiProblem;
import java.util.List;
import java.util.UUID;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.MethodParameter;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;
import org.springframework.web.bind.support.WebDataBinderFactory;
import org.springframework.web.context.request.NativeWebRequest;
import org.springframework.web.method.support.HandlerMethodArgumentResolver;
import org.springframework.web.method.support.ModelAndViewContainer;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

/** Hands the signed-in person to controller methods that ask for them with {@link Me}. */
@Configuration
class MeResolver implements HandlerMethodArgumentResolver, WebMvcConfigurer {

    @Override
    public void addArgumentResolvers(List<HandlerMethodArgumentResolver> resolvers) {
        resolvers.add(this);
    }

    @Override
    public boolean supportsParameter(MethodParameter parameter) {
        return parameter.hasParameterAnnotation(Me.class)
                && (parameter.getParameterType() == UUID.class || parameter.getParameterType() == CurrentUser.class);
    }

    @Override
    public Object resolveArgument(
            MethodParameter parameter,
            ModelAndViewContainer container,
            NativeWebRequest request,
            WebDataBinderFactory binders) {
        CurrentUser user = current();
        return parameter.getParameterType() == UUID.class ? user.id() : user;
    }

    /** The person behind the current request. Everything under /v1 is signed in, so this only fails if the security rules change. */
    static CurrentUser current() {
        Authentication who = SecurityContextHolder.getContext().getAuthentication();
        if (who instanceof JwtAuthenticationToken token) {
            return CurrentUser.from(token.getToken());
        }
        throw ApiProblem.unauthorized("signed_out", "Please sign in again.");
    }
}
