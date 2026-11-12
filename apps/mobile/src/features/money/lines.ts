import type { BillResponse, BillRowResponse, CircleResponse, ExpenseResponse, MemberResponse, PersonBrief, ShareResponse } from '@/api/generated/homeport';
import { membersOf } from '@/features/circles/members';
import { daysBetween, formatComingDay, formatDay, formatWeekday, toISODate, today } from '@/lib/dates';
import { formatMoneyExact, formatMoneyRound } from '@/lib/money';
import { firstName } from '@/lib/names';
import { words } from '@/words';

/** The people of a circle who can pay a share of something: everyone with a phone of their own who isn't a child. */
export function payers(circle: CircleResponse): MemberResponse[] {
  return membersOf(circle).filter((member) => member.kind === 'person' && member.role !== 'child' && member.role !== 'guest');
}

/** A member as the API names a person on a bill or a cell. */
export function briefOf(member: MemberResponse): PersonBrief {
  return { memberId: member.id, name: firstName(member.name), avatarUrl: member.avatarUrl };
}

/** What a bill's line says after its day: who it is split with, where its login is, or how it gets paid. */
function about(bill: BillRowResponse): string | null {
  if (bill.splitWith.length) return words.money.row.splitWith(bill.splitWith.map((person) => firstName(person.name)));
  if (bill.hasLogin) return words.money.row.login;
  if (bill.pays === 'standing_order') return words.money.row.standingOrder;
  if (bill.pays === 'direct_debit') return words.money.row.directDebit;
  return bill.subscription ? words.money.row.subscription : null;
}

/**
 * The line under a bill's name in a list: "Tomorrow · split with Alex", "Mon 16 Nov · standing order",
 * "Paid 8 Nov". `soon` is true for one that is due by tomorrow or late: its line is drawn in the warning colour.
 */
export function billLine(bill: BillRowResponse, from: string = today()): { text: string; soon: boolean } {
  if (bill.paid) {
    const day = bill.paidAt ? formatDay(toISODate(new Date(bill.paidAt))) : formatDay(bill.dueOn);
    return { text: words.common.join([words.money.row.paid(day), about(bill)]), soon: false };
  }
  const inDays = daysBetween(from, bill.dueOn);
  const when = inDays < 0 ? words.money.row.late(formatWeekday(bill.dueOn)) : formatComingDay(bill.dueOn, from);
  return { text: words.common.join([when, about(bill)]), soon: inDays <= 1 };
}

/** The same for a subscription in its own list: when it renews, and what it comes to in a year. */
export function subscriptionLine(bill: BillRowResponse, from: string = today()): string {
  return words.common.join([formatComingDay(bill.dueOn, from), bill.yearCents === null ? null : words.money.row.aYear(formatMoneyRound(bill.yearCents, bill.currency))]);
}

/** "50/50" for two people who pay the same, "60/40" when they don't. Null for one person or more than two. */
export function ratio(shares: readonly ShareResponse[]): string | null {
  if (shares.length !== 2) return null;
  const all = shares[0]!.parts + shares[1]!.parts;
  if (all <= 0) return null;
  const first = Math.round((shares[0]!.parts * 100) / all);
  return `${first}/${100 - first}`;
}

/** True when everyone who pays a share pays the same. */
function even(shares: readonly ShareResponse[]): boolean {
  return shares.every((share) => share.parts === shares[0]?.parts);
}

/** True for a bill two people pay half each: the app then says "your half" instead of "your share". */
export function isHalves(bill: BillResponse): boolean {
  return bill.shares.length === 2 && even(bill.shares);
}

/**
 * The two lines of a bill's "who pays" row: "Split 50/50 with Alex" over "€42.10 each · Alex has paid".
 * (The drawing says "has paid his"; the app doesn't know anybody's pronoun, so it stops a word sooner.)
 */
export function whoPays(bill: BillResponse): { title: string; note: string } {
  const others = bill.shares.filter((share) => !share.you);
  const names = others.map((share) => firstName(share.person.name));
  const mine = bill.myShare;
  if (bill.shares.length <= 1) {
    const only = bill.shares[0];
    const title = !only || only.you ? words.money.bill.split.allYours : words.money.bill.split.allTheirs(firstName(only.person.name));
    return { title, note: only?.paid ? words.money.bill.split.allPaid : words.money.bill.split.nothingPaid };
  }
  const title = words.money.bill.split.title(mine ? ratio(bill.shares) : null, names.length ? names : bill.shares.map((share) => firstName(share.person.name)));
  const amount = even(bill.shares) ? words.money.bill.split.each(formatMoneyExact(bill.shares[0]!.cents, bill.currency)) : mine ? words.money.bill.split.yours(formatMoneyExact(mine.cents, bill.currency)) : null;
  const paid = bill.shares.filter((share) => share.paid).length;
  const standing =
    paid === bill.shares.length
      ? words.money.bill.split.allPaid
      : others.length === 1
        ? others[0]!.paid
          ? words.money.bill.split.hasPaid(names[0]!)
          : words.money.bill.split.hasNotPaid(names[0]!)
        : paid === 0
          ? words.money.bill.split.nothingPaid
          : words.money.bill.split.paidCount(paid, bill.shares.length);
  return { title, note: words.common.join([amount, standing]) };
}

/** How a bill comes round, and how it reminds: "Every month, around the 12th" over "Reminds you 2 days before". */
export function comesRound(bill: BillResponse): { title: string; note: string } {
  const day = bill.dueDay;
  const title =
    bill.repeat === 'monthly'
      ? words.money.bill.repeat.monthly(day)
      : bill.repeat === 'months'
        ? words.money.bill.repeat.months(bill.everyMonths, day)
        : bill.repeat === 'yearly'
          ? words.money.bill.repeat.yearly(formatDay(bill.dueOn).replace(/ \d{4}$/, ''))
          : words.money.bill.repeat.once;
  const how = bill.pays === 'standing_order' ? words.money.bill.repeat.byStandingOrder : bill.pays === 'direct_debit' ? words.money.bill.repeat.byDirectDebit : null;
  const reminds = bill.remindDays === null ? words.money.bill.repeat.noReminder : words.money.bill.repeat.reminds(bill.remindDays);
  return { title, note: words.common.join([reminds, how]) };
}

/**
 * The line under an expense in a split: "Kai paid · split 5 ways", "You paid · split with Lea". With two
 * people sharing it, the reader is told who the other one is.
 */
export function expenseLine(expense: ExpenseResponse): string {
  const who = expense.paidByYou ? words.money.split.youPaid : words.money.split.paid(firstName(expense.paidBy?.name));
  const sharers = expense.shares;
  const others = sharers.filter((share) => !share.you).map((share) => firstName(share.person.name));
  let how: string;
  if (sharers.length >= 3) how = words.money.split.ways(sharers.length);
  else if (sharers.length === 2) how = others.length === 1 ? words.money.split.with(others) : words.money.split.between(others);
  else how = sharers[0]?.you ? words.money.split.forYou : words.money.split.for(others[0] ?? '');
  return words.common.join([who, how]);
}
