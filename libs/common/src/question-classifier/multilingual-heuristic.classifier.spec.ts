/**
 * @file Unit tests for the multilingual heuristic question classifier.
 * @module @ghostless/common
 */

import { MultilingualHeuristicClassifier } from './multilingual-heuristic.classifier';

describe('MultilingualHeuristicClassifier', () => {
  const c = new MultilingualHeuristicClassifier();

  describe('question marks across scripts', () => {
    it.each([
      ['Hey?',          'Latin ?'],
      ['今天来吗？',     'CJK full-width ？'],
      ['هل ستأتي؟',     'Arabic ؟'],
      ['Բարև՞',         'Armenian ՞'],
    ])('flags %s (%s)', (text) => {
      expect(c.classifySync(text)).toBe(true);
    });

    it('flags Greek ; as question mark only when script is Greek', () => {
      expect(c.classifySync('Πώς είσαι;')).toBe(true);
      // A trailing ; in Latin is NOT a question
      expect(c.classifySync('hello;')).toBe(false);
    });
  });

  describe('interrogative starters (no `?`)', () => {
    it.each([
      ['wanna grab coffee tomorrow',     'en wanna'],
      ['How are you',                    'en how'],
      ['vienes mañana',                  'es vienes'],
      ['hast du Zeit',                   'de hast'],
      ['هل ستأتي',                       'ar هل'],
      ['מה שלומך',                       'he מה'],
    ])('flags %s (%s)', (text) => {
      expect(c.classifySync(text)).toBe(true);
    });
  });

  describe('CJK ending particles', () => {
    it.each([
      ['今天来吗',  'zh 吗'],
      ['一起去吧',  'zh 吧'],
      ['元気か',    'ja か'],
    ])('flags %s', (text) => {
      expect(c.classifySync(text)).toBe(true);
    });
  });

  describe('non-questions', () => {
    it.each([
      ['going to sleep now',  'en statement'],
      ['estoy cansado',       'es statement'],
      ['今天天气很好',         'zh statement'],
      ['',                    'empty string'],
      ['   ',                 'whitespace only'],
    ])('does NOT flag %s (%s)', (text) => {
      expect(c.classifySync(text)).toBe(false);
    });
  });

  it('async classify delegates to sync', async () => {
    await expect(c.classify('How are you?')).resolves.toBe(true);
    await expect(c.classify('hello')).resolves.toBe(false);
  });
});
