import type { Href } from 'expo-router';

/**
 * Where "Templates" in a space leads: the gallery of templates, which is built with the templates
 * themselves. Null until that screen is part of the build; the button then says so instead of opening it.
 * (When it is there, this is its address: `'/templates'`.)
 */
export const TEMPLATES: Href | null = null;
