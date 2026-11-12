package app.homeport.api.common;

import java.lang.reflect.InvocationTargetException;
import java.lang.reflect.Method;
import java.util.Locale;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.convert.converter.Converter;
import org.springframework.core.convert.converter.ConverterFactory;
import org.springframework.format.FormatterRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

/**
 * A word from a fixed set (a place, a kind) is written the same way in an address as in a body: lower case,
 * {@code ?place=vault}. Each such enum has an {@code of(String)} that turns the word into the constant, or
 * answers in its own sentence when the word isn't one of the set; this makes addresses use it too.
 */
@Configuration
class WordsInAddresses implements WebMvcConfigurer {

    @Override
    public void addFormatters(FormatterRegistry registry) {
        registry.addConverterFactory(new ConverterFactory<String, Enum<?>>() {
            @Override
            public <T extends Enum<?>> Converter<String, T> getConverter(Class<T> type) {
                return word -> read(type, word);
            }
        });
    }

    @SuppressWarnings({"unchecked", "rawtypes"})
    private static <T extends Enum<?>> T read(Class<T> type, String word) {
        if (word == null || word.isBlank()) {
            return null;
        }
        try {
            Method of = type.getMethod("of", String.class);
            return (T) of.invoke(null, word);
        } catch (NoSuchMethodException plain) {
            return (T) Enum.valueOf((Class) type, word.trim().toUpperCase(Locale.ROOT));
        } catch (InvocationTargetException refused) {
            if (refused.getCause() instanceof RuntimeException problem) {
                throw problem;
            }
            throw new IllegalArgumentException(refused.getCause());
        } catch (IllegalAccessException impossible) {
            throw new IllegalStateException(impossible);
        }
    }
}
