import { splitDraft } from '../draft';

describe('a new word, and what it means', () => {
  it('takes the two halves apart at a colon, a dash or an equals sign', () => {
    expect(splitDraft('gate cardio: the sprint from security to boarding')).toEqual({ word: 'gate cardio', meaning: 'the sprint from security to boarding' });
    expect(splitDraft('hill tax - what Lisbon charges for every nice view')).toEqual({ word: 'hill tax', meaning: 'what Lisbon charges for every nice view' });
    expect(splitDraft('to pastel – to stop for a custard tart')).toEqual({ word: 'to pastel', meaning: 'to stop for a custard tart' });
    expect(splitDraft('home legs = what arrives two days after you do')).toEqual({ word: 'home legs', meaning: 'what arrives two days after you do' });
  });

  it('keeps a word with a hyphen in it whole, and cuts only at the first mark', () => {
    expect(splitDraft('second-breakfast')).toEqual({ word: 'second-breakfast', meaning: '' });
    expect(splitDraft('a soft no: "Let\'s see: how we feel."')).toEqual({ word: 'a soft no', meaning: '"Let\'s see: how we feel."' });
  });

  it('takes it all as the word when nothing follows, and trims what was typed', () => {
    expect(splitDraft('  tram o\'clock  ')).toEqual({ word: "tram o'clock", meaning: '' });
    expect(splitDraft('tram o\'clock:')).toEqual({ word: "tram o'clock", meaning: '' });
    expect(splitDraft(': nothing before the mark')).toEqual({ word: ': nothing before the mark', meaning: '' });
    expect(splitDraft('')).toEqual({ word: '', meaning: '' });
  });

  it('keeps each half to what the API takes', () => {
    const long = splitDraft(`${'w'.repeat(100)}: ${'m'.repeat(600)}`);
    expect(long.word).toHaveLength(80);
    expect(long.meaning).toHaveLength(500);
  });
});
