# The Homeport API as a small image. Build it from the repository root:
#   docker build -t homeport-api apps/api
# It needs a database (HOMEPORT_DB_URL, HOMEPORT_DB_USER, HOMEPORT_DB_PASSWORD) and, once they are connected,
# the sign-in and storage services. See docs/02-tech-stack.md.

FROM eclipse-temurin:21-jdk AS build
WORKDIR /src
COPY .mvn .mvn
COPY mvnw pom.xml ./
# The dependencies change far less often than the code, so they get a layer of their own.
RUN ./mvnw -B -ntp dependency:go-offline
COPY src src
# The tests need a database and run in CI, not here.
RUN ./mvnw -B -ntp -DskipTests package

# Runs on Java 25, as the tech plan says. The code is built for Java 21; CI runs the tests on both.
FROM eclipse-temurin:25-jre
RUN useradd --system --uid 10001 --no-create-home homeport
WORKDIR /app
COPY --from=build /src/target/homeport-api-*.jar app.jar
USER homeport
EXPOSE 8080
# Java may use 60% of the machine's memory for its own heap; the rest is for everything else it needs
# (threads, buffers for photos on their way in and out). If it ever does run out, it stops at once, so the
# platform starts a fresh copy instead of leaving a half-working one answering "healthy".
ENV JAVA_TOOL_OPTIONS="-XX:MaxRAMPercentage=60 -XX:+ExitOnOutOfMemoryError"
ENTRYPOINT ["java", "-jar", "app.jar"]
