import { readFileSync } from 'node:fs';
import { defineConfig } from 'orval';

// The API's own description, or another one named by OPENAPI (`OPENAPI=some.json npm run api:generate`), for
// trying the app against a description that is not the API's yet.
const description = process.env.OPENAPI || '../api/openapi.json';

// The lists that come in pages (items + nextCursor) each get a hook that loads page after page. They are read
// from the description itself: every operation that takes a `cursor`. Nothing to add by hand.
type Operation = { operationId?: string; parameters?: { name?: string }[] };
const api = JSON.parse(readFileSync(description, 'utf8')) as { paths: Record<string, Record<string, Operation>> };
const PAGED = Object.values(api.paths)
  .flatMap((path) => Object.values(path))
  .filter((operation) => (operation.parameters ?? []).some((parameter) => parameter.name === 'cursor'))
  .flatMap((operation) => (operation.operationId ? [operation.operationId] : []));

// Generates the app's typed API client from the API's description.
// Run `npm run api:generate` after apps/api/openapi.json changes.
export default defineConfig({
  homeport: {
    input: description,
    output: {
      mode: 'single',
      target: 'src/api/generated/homeport.ts',
      client: 'react-query',
      httpClient: 'fetch',
      clean: true,
      override: {
        mutator: { path: 'src/api/fetcher.ts', name: 'apiFetch' },
        fetch: { includeHttpResponseReturnType: false },
        operations: Object.fromEntries(
          PAGED.map((operation) => [operation, { query: { useQuery: true, useInfinite: true, useInfiniteQueryParam: 'cursor' } }]),
        ),
      },
    },
  },
});
