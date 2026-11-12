package app.homeport.api;

import java.lang.reflect.InvocationTargetException;
import java.lang.reflect.Proxy;
import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.SQLException;
import java.sql.Statement;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import javax.sql.DataSource;
import org.springframework.beans.factory.config.BeanPostProcessor;
import org.springframework.jdbc.datasource.DelegatingDataSource;
import org.springframework.stereotype.Component;

/**
 * Writes down every SQL statement the thread of a test sends to the database, when the test asks it to. It
 * sits between the API and the connection pool in every test (it is found like any other component), costs
 * nothing while no test is recording, and never sees what other threads (the background jobs) send.
 *
 * <p>{@link QueryCostTest} uses it to say "this screen costs the same number of statements for one journey
 * and for twenty" and "none of these statements reads a whole table".
 */
@Component
public class SqlRecorder implements BeanPostProcessor {

    /** One statement as it was sent: its SQL with a question mark for each value, and the values. */
    public record Sent(String sql, Map<Integer, Object> values) {

        /** The statement with its values written in, the way one would type it to ask the database for its plan. */
        public String filledIn() {
            StringBuilder out = new StringBuilder();
            boolean quoted = false;
            int n = 0;
            for (char c : sql.toCharArray()) {
                if (c == '\'') {
                    quoted = !quoted;
                }
                out.append(c == '?' && !quoted ? literal(values.get(++n)) : String.valueOf(c));
            }
            return out.toString();
        }

        private static String literal(Object value) {
            return switch (value) {
                case null -> "null";
                case Number number -> number.toString();
                case Boolean bool -> bool.toString();
                case java.util.UUID id -> "'" + id + "'::uuid";
                case java.sql.Timestamp moment -> "'" + moment.toInstant() + "'::timestamptz";
                case java.sql.Date day -> "'" + day + "'::date";
                case java.time.LocalDate day -> "'" + day + "'::date";
                default -> "'" + value.toString().replace("'", "''") + "'";
            };
        }
    }

    private static final ThreadLocal<List<Sent>> RECORDING = new ThreadLocal<>();

    /** Starts writing down what this thread sends. */
    public void start() {
        RECORDING.set(new ArrayList<>());
    }

    /** Stops, and gives back the statements sent since {@link #start()}, in order. */
    public List<Sent> stop() {
        List<Sent> sent = RECORDING.get();
        RECORDING.remove();
        return sent == null ? List.of() : sent;
    }

    private static void sent(String sql, Map<Integer, Object> values) {
        List<Sent> recording = RECORDING.get();
        if (recording != null) {
            recording.add(new Sent(sql, new HashMap<>(values)));
        }
    }

    @Override
    public Object postProcessAfterInitialization(Object bean, String beanName) {
        if (bean instanceof DataSource pool && !(bean instanceof Recording)) {
            return new Recording(pool);
        }
        return bean;
    }

    /** The pool, handing out connections that report what is executed on them. */
    private static final class Recording extends DelegatingDataSource {

        Recording(DataSource pool) {
            super(pool);
        }

        @Override
        public Connection getConnection() throws SQLException {
            return watched(super.getConnection());
        }

        @Override
        public Connection getConnection(String username, String password) throws SQLException {
            return watched(super.getConnection(username, password));
        }
    }

    private static Connection watched(Connection connection) {
        return (Connection) Proxy.newProxyInstance(
                SqlRecorder.class.getClassLoader(), new Class<?>[] {Connection.class}, (proxy, method, args) -> {
                    Object result = call(connection, method, args);
                    if (method.getName().equals("prepareStatement") && result instanceof PreparedStatement prepared) {
                        return watched(prepared, PreparedStatement.class, (String) args[0]);
                    }
                    if (method.getName().equals("createStatement") && result instanceof Statement statement) {
                        return watched(statement, Statement.class, null);
                    }
                    return result;
                });
    }

    /** A statement that reports its SQL, and the values it was given, each time it is executed. */
    private static Object watched(Statement statement, Class<?> type, String prepared) {
        Map<Integer, Object> values = new HashMap<>();
        return Proxy.newProxyInstance(
                SqlRecorder.class.getClassLoader(), new Class<?>[] {type}, (proxy, method, args) -> {
                    String name = method.getName();
                    if (name.startsWith("set") && args != null && args.length >= 2 && args[0] instanceof Integer at) {
                        values.put(at, name.equals("setNull") ? null : args[1]);
                    } else if (name.startsWith("execute")) {
                        sent(
                                prepared != null ? prepared : args != null && args.length > 0 ? (String) args[0] : "",
                                values);
                    }
                    return call(statement, method, args);
                });
    }

    private static Object call(Object target, java.lang.reflect.Method method, Object[] args) throws Throwable {
        try {
            return method.invoke(target, args);
        } catch (InvocationTargetException failed) {
            throw failed.getCause();
        }
    }
}
