import type { SaturdayJarIdeaResponse, SaturdayJarResponse } from '@/api/generated/homeport';
import { formatMonth, formatMonthName, monthOf, today } from '@/lib/dates';
import { formatMoney } from '@/lib/money';
import { words } from '@/words';

const say = words.perks.saturdayJar;

type Idea = Pick<SaturdayJarIdeaResponse, 'by' | 'place' | 'minutes' | 'cents' | 'addedOn'>;

/** True for an idea that costs nothing, as far as anyone said. */
const isFree = (idea: Pick<Idea, 'cents'>) => !idea.cents;

/**
 * The line under an idea in the list: who put it in, then the two things most worth knowing, in this order:
 * that it is at home, how long it takes, what it costs. "Leo · at home · free", "Alex · half a day · about €60".
 */
export function ideaLine(idea: Idea): string {
  const facts = [idea.place === 'home' ? say.place.home : null, idea.minutes ? say.time(idea.minutes) : null, isFree(idea) ? say.free : say.about(formatMoney(idea.cents ?? 0))];
  return words.common.join([idea.by?.name, ...facts.filter(Boolean).slice(0, 2)]);
}

/**
 * The tags on the slip that was pulled: what it costs, how long it takes, the sky, and whether everyone is
 * free. The sky is the weather when a source says it; none does yet, so the slip says where the idea is
 * instead. That everyone is free is only said when the calendar says so.
 */
export function slipTags(idea: Idea, jar: Pick<SaturdayJarResponse, 'weather' | 'everyoneFree' | 'people'>): string[] {
  const place = idea.place === 'home' || idea.place === 'indoors' || idea.place === 'outdoors' ? say.placeTag[idea.place] : null;
  return [isFree(idea) ? say.freeTag : say.aboutTag(formatMoney(idea.cents ?? 0)), idea.minutes ? say.timeTag(idea.minutes) : null, jar.weather ?? place, jar.everyoneFree ? say.allFree(jar.people) : null].filter((tag): tag is string => !!tag);
}

/** "Mia put this one in, back in June": who dropped an idea in, and in which month (with its year once that is another). */
export function putInLine(idea: Idea, from: string = today()): string {
  const name = idea.by?.name ?? say.someone;
  if (monthOf(idea.addedOn) === monthOf(from)) return say.putInThisMonth(name);
  return say.putIn(name, idea.addedOn.slice(0, 4) === from.slice(0, 4) ? formatMonthName(idea.addedOn) : formatMonth(idea.addedOn));
}
