import type { CacheTools } from './tools';

/**
 * Plan: events, reminders, jobs, goals. What the app does to what it has loaded when something of this place changes: one function
 * per thing that can happen, made of `tools` (see tools.ts). Screens call them through `useCache()`.
 * Empty until this place's screens are built.
 */
export const planCache = (tools: CacheTools) => ({});
