package app.homeport.api.share;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.servlet.HandlerInterceptor;
import org.springframework.web.servlet.ModelAndView;
import org.springframework.web.servlet.config.annotation.InterceptorRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

/**
 * The pages anyone can open without signing in look the same for everyone, so a browser (and anything
 * between it and the API) may keep them for a moment: a shared link that many people open at once is not
 * worked out afresh for each of them. A journey's, an entry's or a person's page for a minute; the legal
 * pages for an hour. Pages that say "this isn't available", and the invitation page (which changes the
 * moment the link is used), are never kept.
 */
@Configuration
class PublicPageCache implements WebMvcConfigurer {

    @Override
    public void addInterceptors(InterceptorRegistry registry) {
        registry.addInterceptor(keepFor(60)).addPathPatterns("/j/**", "/e/**", "/u/**");
        registry.addInterceptor(keepFor(3600)).addPathPatterns("/terms", "/privacy", "/guidelines", "/contact");
    }

    private static HandlerInterceptor keepFor(int seconds) {
        return new HandlerInterceptor() {
            @Override
            public void postHandle(
                    HttpServletRequest request, HttpServletResponse response, Object handler, ModelAndView page) {
                if ("GET".equals(request.getMethod()) && response.getStatus() == HttpServletResponse.SC_OK) {
                    response.setHeader("Cache-Control", "public, max-age=" + seconds);
                }
            }
        };
    }
}
