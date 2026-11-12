import type { CacheTools } from './tools';

/**
 * Templates: what starting from one makes. What the app does to what it has loaded when something of this place changes: one function
 * per thing that can happen, made of `tools` (see tools.ts). Screens call them through `useCache()`.
 * Empty until this place's screens are built.
 */
export const templatesCache = (tools: CacheTools) => ({});
