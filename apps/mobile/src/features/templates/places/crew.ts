import type { Template } from '@/api/generated/homeport';

import type { AnyBuiltTemplate } from '../types';

/**
 * Friends (19): the templates that do work drawn in `design/hub/src/screens/crew.html`. One line per template, as
 * in `notes.ts`: its code, the types of its view and settings, its screen. Only this place's builder
 * changes this file ("Adding a template" in apps/mobile/README.md).
 */
export const crewTemplates = {} satisfies Partial<Record<Template, AnyBuiltTemplate>>;
