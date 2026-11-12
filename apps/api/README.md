# Journey API

The backend of Journey: a Spring Boot (Java) API that holds every rule. The app never talks to the database itself.

```sh
./mvnw spring-boot:run -Dspring-boot.run.profiles=local   # run it (needs the local database)
./mvnw test                                               # tests, against a real PostgreSQL
UPDATE_OPENAPI=1 ./mvnw test                              # after changing the API on purpose: refresh openapi.json
```

- **Local mode** (`local` profile): sign in with any email and the code 123456. Outside services have stand-ins.
- **Try the endpoints:** http://localhost:8080/swagger-ui.html
- **Layout:** one package per feature under `src/main/java/app/journey/api` (`auth`, `profile`, …), with shared pieces in `common`. Database changes are Flyway migrations in `src/main/resources/db/migration`.
- **openapi.json** describes the API. The app's TypeScript client is generated from it, and a test fails when the file is out of date.

Setup and everyday commands: [docs/07-run-locally.md](../../docs/07-run-locally.md). Why Java and what else is in the stack: [docs/02-tech-stack.md](../../docs/02-tech-stack.md).
