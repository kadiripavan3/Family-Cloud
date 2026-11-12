import { circle, coupleCircle, crewCircle, linds, member, soloCircle } from '@/test/samples';

import { circleLine, headcount, isYoung, membersOf } from '../members';

describe('the people of a circle', () => {
  it('counts people and names pets', () => {
    expect(headcount(linds)).toEqual({ people: 4, pets: ['Biscuit'] });
    expect(circleLine(linds)).toBe('Family · 4 people and Biscuit');
    expect(circleLine(coupleCircle)).toBe('Couple · 2 people');
    expect(circleLine(crewCircle)).toBe('Friends · 5 people');
    expect(circleLine(soloCircle)).toBe('Just me · Just you');
  });

  it('leaves out someone who left', () => {
    const afterAna = circle({ members: [...crewCircle.members.slice(0, 4), member({ id: 'm-ana', name: 'Ana', status: 'left' })] });
    expect(membersOf(afterAna)).toHaveLength(4);
    expect(headcount(afterAna).people).toBe(4);
  });

  it('knows a teen and a child from the adults', () => {
    expect(isYoung(linds)).toBe(false);
    expect(isYoung(circle({ myRole: 'teen' }))).toBe(true);
    expect(isYoung(circle({ myRole: 'child' }))).toBe(true);
    expect(isYoung(circle({ myRole: 'guest' }))).toBe(false);
  });
});
