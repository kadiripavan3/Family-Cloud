import type { CacheTools } from './tools';

/**
 * Library: photos, videos, documents, albums. What the app does to what it has loaded when something of this place changes: one function
 * per thing that can happen, made of `tools` (see tools.ts). Screens call them through `useCache()`.
 * Empty until this place's screens are built.
 */
export const libraryCache = (tools: CacheTools) => ({});
