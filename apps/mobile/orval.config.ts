import { defineConfig } from 'orval';

// The lists that come in pages (items + nextCursor). Each gets a hook that loads page after page.
// Add an operation's id here when the API gets a list with a cursor.
const PAGED = ['getPages', 'getChecklists'];

// The API's own description, or another one named by OPENAPI (`OPENAPI=some.json npm run api:generate`), for
// trying the app against a description that is not the API's yet.
const description = process.env.OPENAPI || '../api/openapi.json';

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
