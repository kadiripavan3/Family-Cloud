import type { Audience, GoalChangeRequest, GoalResponse, NewGoalRequest } from '@/api/generated/homeport';
import { today } from '@/lib/dates';

import { readCents, readCount } from './times';

/** What a goal counts: money, a number of something, or the ticked steps of a list. */
export type GoalKind = 'money' | 'count' | 'steps';

/** What the form of a goal holds while it is being written. Amounts are as they were typed. */
export type GoalDraft = {
  title: string;
  blurb: string;
  emoji: string;
  kind: GoalKind;
  /** How much or how many, as typed. */
  target: string;
  /** What there is already, as typed. */
  current: string;
  /** What is counted, when it isn't money: books, stars. */
  unitWords: string;
  /** The steps of a goal that counts ticks, one on each line. */
  steps: string;
  /** The day to be done by. Null: none. */
  by: string | null;
};

export function newGoalDraft(): GoalDraft {
  return { title: '', blurb: '', emoji: '🎯', kind: 'money', target: '', current: '', unitWords: '', steps: '', by: null };
}

/** What a goal counts, from what the API says of it. */
export function kindOfGoal(goal: Pick<GoalResponse, 'unit' | 'how'>): GoalKind {
  return goal.how === 'ticks' ? 'steps' : goal.unit === 'money' ? 'money' : 'count';
}

/** An amount in a goal's unit the way it is typed into a box: cents as "150" or "12.50", a count as it is. */
function typed(amount: number, kind: GoalKind): string {
  if (kind !== 'money') return String(amount);
  return amount % 100 === 0 ? String(amount / 100) : (amount / 100).toFixed(2);
}

export function goalDraftOf(goal: GoalResponse): GoalDraft {
  const kind = kindOfGoal(goal);
  return { title: goal.title, blurb: goal.blurb, emoji: goal.emoji, kind, target: typed(goal.target, kind), current: '', unitWords: goal.unitWords, steps: '', by: goal.targetDay };
}

/** The lines of a box with one thing on each line, without the empty ones. */
export function stepsOf(typedSteps: string): string[] {
  return typedSteps.split('\n').map((line) => line.trim()).filter(Boolean);
}

/** What is typed for an amount in a goal's unit, as the API counts it (cents for money). Null when it can't be read. */
export function readAmount(typedAmount: string, kind: GoalKind): number | null {
  return kind === 'money' ? readCents(typedAmount) : readCount(typedAmount);
}

/** What is wrong with a draft, by the box it is about. Empty when it can be saved. */
export function goalProblems(draft: GoalDraft, says: { needsTitle: string; needsTarget: string; needsSteps: string }): { title?: string; target?: string; steps?: string } {
  const problems: { title?: string; target?: string; steps?: string } = {};
  if (draft.title.trim().length === 0) problems.title = says.needsTitle;
  if (draft.kind === 'steps') {
    if (stepsOf(draft.steps).length === 0) problems.steps = says.needsSteps;
  } else if (!readAmount(draft.target, draft.kind)) problems.target = says.needsTarget;
  return problems;
}

/** What to send to start the goal a draft describes. */
export function newGoalRequest(draft: GoalDraft, with_: { clientId: string; circleId: string; audience?: Audience }): NewGoalRequest {
  const base = {
    clientId: with_.clientId,
    circleId: with_.circleId,
    title: draft.title.trim(),
    blurb: draft.blurb.trim() || undefined,
    emoji: draft.emoji || undefined,
    targetDay: draft.by ?? undefined,
    day: today(),
    audience: with_.audience,
  };
  if (draft.kind === 'steps') return { ...base, how: 'ticks', steps: stepsOf(draft.steps) };
  return {
    ...base,
    unit: draft.kind,
    unitWords: draft.kind === 'count' ? draft.unitWords.trim() || undefined : undefined,
    target: readAmount(draft.target, draft.kind) ?? undefined,
    current: readAmount(draft.current, draft.kind) || undefined,
  };
}

/** What to send to change a goal into what a draft says. What it counts stays as it began. */
export function goalChangeRequest(draft: GoalDraft, goal: GoalResponse): GoalChangeRequest {
  const kind = kindOfGoal(goal);
  return {
    title: draft.title.trim(),
    blurb: draft.blurb.trim(),
    emoji: draft.emoji,
    ...(kind === 'steps' ? {} : { target: readAmount(draft.target, kind) ?? goal.target }),
    ...(kind === 'count' ? { unitWords: draft.unitWords.trim() } : {}),
    ...(draft.by ? { targetDay: draft.by } : goal.targetDay ? { removeTargetDay: true } : {}),
    day: today(),
  };
}
