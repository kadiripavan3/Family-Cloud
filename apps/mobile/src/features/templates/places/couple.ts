import type { Template } from '@/api/generated/homeport';

import type { AnyBuiltTemplate } from '../types';

/**
 * Couples (17): the templates that do work drawn in `design/hub/src/screens/couple.html`. One line per template, as
 * in `notes.ts`: its code, the types of its view and settings, its screen. Only this place's builder
 * changes this file ("Adding a template" in apps/mobile/README.md).
 */
export const coupleTemplates = {} satisfies Partial<Record<Template, AnyBuiltTemplate>>;
