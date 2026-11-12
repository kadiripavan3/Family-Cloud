import { bill, billRow, expense, share } from '@/test/samples/money';

import { billLine, comesRound, expenseLine, isHalves, ratio, subscriptionLine, whoPays } from '../lines';

const alexBrief = { memberId: 'm-alex', name: 'Alex', avatarUrl: null };

describe('a bill as a line in a list', () => {
  it('says when it is due, and who it is split with', () => {
    expect(billLine(billRow(), '2026-11-12')).toEqual({ text: 'Tomorrow · split with Alex', soon: true });
    expect(billLine(billRow({ dueOn: '2026-11-12' }), '2026-11-12')).toEqual({ text: 'Today · split with Alex', soon: true });
  });

  it('says how it gets paid, or where its login is, when nobody shares it', () => {
    expect(billLine(billRow({ dueOn: '2026-11-16', splitWith: [], pays: 'standing_order' }), '2026-11-12')).toEqual({ text: 'Mon 16 Nov · standing order', soon: false });
    expect(billLine(billRow({ dueOn: '2026-11-20', splitWith: [], pays: 'direct_debit', hasLogin: true }), '2026-11-12').text).toBe('Fri 20 Nov · login in the Vault');
    expect(billLine(billRow({ dueOn: '2026-11-20', splitWith: [], pays: 'direct_debit' }), '2026-11-12').text).toBe('Fri 20 Nov · direct debit');
    expect(billLine(billRow({ dueOn: '2026-11-20', splitWith: [], subscription: true }), '2026-11-12').text).toBe('Fri 20 Nov · subscription');
    expect(billLine(billRow({ dueOn: '2026-11-20', splitWith: [] }), '2026-11-12').text).toBe('Fri 20 Nov');
  });

  it('says so when it is late, and when it was paid', () => {
    expect(billLine(billRow({ dueOn: '2026-11-09', splitWith: [] }), '2026-11-12')).toEqual({ text: 'Was due Mon 9 Nov', soon: true });
    expect(billLine(billRow({ paid: true, paidAt: '2026-11-08T09:00:00Z', splitWith: [] }), '2026-11-12')).toEqual({ text: 'Paid 8 Nov', soon: false });
  });

  it('says what a subscription comes to in a year', () => {
    expect(subscriptionLine(billRow({ dueOn: '2026-11-20', yearCents: 16788 }), '2026-11-12')).toBe('Fri 20 Nov · €168 a year');
  });
});

describe('who pays a bill', () => {
  it('is 50/50 for two people who pay the same', () => {
    expect(ratio(bill().shares)).toBe('50/50');
    expect(isHalves(bill())).toBe(true);
    expect(whoPays(bill())).toEqual({ title: 'Split 50/50 with Alex', note: '€42.10 each · Alex has paid' });
  });

  it('says the parts when they differ, and whose is still open', () => {
    const uneven = bill({ shares: [share({ parts: 3, cents: 5052 }), share({ person: alexBrief, parts: 2, cents: 3368, you: false })] });
    uneven.myShare = uneven.shares[0]!;
    expect(ratio(uneven.shares)).toBe('60/40');
    expect(isHalves(uneven)).toBe(false);
    expect(whoPays(uneven)).toEqual({ title: 'Split 60/40 with Alex', note: "Your part is €50.52 · Alex hasn't paid yet" });
  });

  it('counts who has paid among three, and says when one person pays it all', () => {
    const three = bill({
      shares: [share({ cents: 2807, paid: true }), share({ person: alexBrief, cents: 2807, you: false }), share({ person: { memberId: 'm-kai', name: 'Kai', avatarUrl: null }, cents: 2806, you: false })],
    });
    expect(ratio(three.shares)).toBeNull();
    expect(whoPays(three)).toEqual({ title: 'Split with Alex and Kai', note: '€28.07 each · 1 of 3 have paid' });
    expect(whoPays(bill({ shares: [share({ cents: 8420 })] }))).toEqual({ title: 'You pay all of it', note: 'Nothing is paid yet' });
    expect(whoPays(bill({ shares: [share({ person: alexBrief, cents: 8420, you: false, paid: true })], myShare: null }))).toEqual({ title: 'Alex pays all of it', note: 'All of it is paid' });
  });
});

describe('how a bill comes round', () => {
  it('names the day of the month, and how it reminds', () => {
    expect(comesRound(bill())).toEqual({ title: 'Every month, around the 13th', note: 'Reminds you 2 days before' });
    expect(comesRound(bill({ dueDay: 1, remindDays: 1 })).title).toBe('Every month, around the 1st');
    expect(comesRound(bill({ dueDay: 22, remindDays: null, pays: 'direct_debit' }))).toEqual({ title: 'Every month, around the 22nd', note: 'No reminder · Paid by direct debit' });
    expect(comesRound(bill({ repeat: 'months', everyMonths: 3, dueDay: 3 })).title).toBe('Every 3 months, around the 3rd');
    expect(comesRound(bill({ repeat: 'yearly' })).title).toBe('Every year, around 13 Nov');
    expect(comesRound(bill({ repeat: 'once', remindDays: 0 }))).toEqual({ title: 'Comes once', note: 'Reminds you on the day' });
  });
});

describe('an expense as a line', () => {
  it('says who paid and how it is split', () => {
    expect(expenseLine(expense())).toBe('Kai paid · split 5 ways');
    const taxi = expense({ paidByYou: true, shares: expense().shares.slice(0, 2) });
    expect(expenseLine(taxi)).toBe('You paid · split with Lea');
    const theirs = expense({ shares: expense().shares.filter((one) => !one.you).slice(0, 2) });
    expect(expenseLine(theirs)).toBe('Kai paid · split between Lea and Kai');
    expect(expenseLine(expense({ paidByYou: true, shares: expense().shares.filter((one) => one.you) }))).toBe('You paid · for you alone');
  });
});
