/**
 * @file Multilingual rule-based question detector used as fallback when the LLM is unavailable.
 * @module @ghostless/common
 */

import { Injectable } from '@nestjs/common';
import { IQuestionClassifier } from './question-classifier.port';

/** Question-mark glyphs across scripts. */
const QUESTION_MARKS = ['?', '？', '؟', '՞'];

/** Interrogative sentence starters per language (lowercased). */
const STARTERS: Record<string, readonly string[]> = {
  en: ['what', 'who', 'whom', 'whose', 'when', 'where', 'why', 'how',
       'which', 'do', 'does', 'did', 'is', 'are', 'am', 'was', 'were',
       'will', 'would', 'can', 'could', 'should', 'shall', 'may', 'might',
       'have', 'has', 'had', 'wanna', 'gonna'],
  es: ['qué', 'que', 'quién', 'quien', 'quiénes', 'cuándo', 'cuando',
       'dónde', 'donde', 'por qué', 'porque', 'cómo', 'como', 'cuál',
       'cual', 'cuáles', 'cuánto', 'cuanto', 'vienes', 'vamos', 'puedes',
       'quieres', 'tienes'],
  fr: ['qui', 'que', 'quoi', 'quand', 'où', 'pourquoi', 'comment',
       'quel', 'quelle', 'combien', 'est-ce', 'as-tu', 'es-tu', 'vas-tu',
       'peux-tu', 'veux-tu'],
  de: ['was', 'wer', 'wem', 'wessen', 'wann', 'wo', 'warum', 'wieso',
       'wie', 'welche', 'welcher', 'welches', 'ist', 'sind', 'hast',
       'hat', 'kannst', 'willst', 'wirst'],
  it: ['che', 'chi', 'cosa', 'quando', 'dove', 'perché', 'come',
       'quale', 'quanto', 'sei', 'hai', 'puoi', 'vuoi'],
  pt: ['o que', 'quem', 'quando', 'onde', 'por que', 'porque', 'como',
       'qual', 'quanto', 'você', 'voce', 'tens', 'podes'],
  ru: ['что', 'кто', 'когда', 'где', 'почему', 'зачем', 'как', 'какой',
       'сколько'],
  he: ['מה', 'מי', 'מתי', 'איפה', 'למה', 'איך', 'כמה', 'איזה', 'האם',
       'תבוא', 'תבואי', 'אתה', 'את'],
  ar: ['ما', 'ماذا', 'من', 'متى', 'أين', 'لماذا', 'كيف', 'كم', 'أي',
       'هل', 'أ'],
  zh: ['什么', '谁', '什么时候', '哪里', '为什么', '怎么', '怎样', '多少',
       '哪个', '是不是', '可以', '能否', '吗'],
  ja: ['何', 'なに', 'なん', '誰', 'だれ', 'いつ', 'どこ', 'なぜ',
       'どうして', 'どう', 'どれ', 'いくら', 'いくつ'],
};

/** Particles or endings that mark questions even without `?`. */
const ENDINGS: Record<string, readonly string[]> = {
  zh: ['吗', '呢', '吧'],
  ja: ['か', 'の？', 'かな', 'かしら'],
};

/**
 * Fast, dependency-free question detector covering ~11 languages.
 * Conservative: prefers false negatives over false positives on short text.
 */
@Injectable()
export class MultilingualHeuristicClassifier implements IQuestionClassifier {
  /** @inheritdoc */
  async classify(text: string, languageHint?: string): Promise<boolean> {
    return this.classifySync(text, languageHint);
  }

  /** Synchronous variant — same logic, no Promise wrapper. */
  classifySync(text: string, languageHint?: string): boolean {
    const trimmed = text.trim();
    if (trimmed.length === 0) return false;

    const lastChar = trimmed[trimmed.length - 1];
    if (QUESTION_MARKS.includes(lastChar)) return true;

    if (trimmed.endsWith(';') && this.detectScript(trimmed) === 'el') {
      return true;
    }

    const lang = languageHint ?? this.detectScript(trimmed);
    const lower = trimmed.toLowerCase();

    const starters = lang && STARTERS[lang] ? [STARTERS[lang]] : Object.values(STARTERS);
    for (const list of starters) {
      for (const s of list) {
        if (lower.startsWith(s + ' ') || lower === s) return true;
      }
    }

    const endingLangs = lang && ENDINGS[lang] ? [ENDINGS[lang]] : Object.values(ENDINGS);
    for (const list of endingLangs) {
      for (const e of list) {
        if (trimmed.endsWith(e)) return true;
      }
    }

    return false;
  }

  /** Coarse script detection from char ranges; returns a BCP-47 hint or undefined. */
  private detectScript(s: string): string | undefined {
    if (/[֐-׿]/.test(s)) return 'he';
    if (/[؀-ۿ]/.test(s)) return 'ar';
    if (/[぀-ゟ゠-ヿ]/.test(s)) return 'ja';
    if (/[一-鿿]/.test(s)) return 'zh';
    if (/[Ѐ-ӿ]/.test(s)) return 'ru';
    if (/[Ͱ-Ͽ]/.test(s)) return 'el';
    return undefined;
  }
}
