/**
 * @file Unit tests for the HF classifier's success and fallback paths.
 * @module @ghostless/common
 */

import { HuggingFaceQuestionClassifier } from './huggingface.classifier';
import { MultilingualHeuristicClassifier } from './multilingual-heuristic.classifier';
import { NetworkHttpError, NetworkTimeoutError } from '@ghostless/network';

type Network = { postJson: jest.Mock };

function makeClassifier(network: Network, token: string | undefined = 'fake-token') {
  const heuristic = new MultilingualHeuristicClassifier();
  return new HuggingFaceQuestionClassifier(
    heuristic,
    network as unknown as import('@ghostless/network').NetworkService,
    token,
    1_000,
  );
}

describe('HuggingFaceQuestionClassifier', () => {
  it('returns true when HF top label is "question"', async () => {
    const network = { postJson: jest.fn().mockResolvedValue([
      { label: 'question', score: 0.9 },
      { label: 'statement', score: 0.1 },
    ]) };
    const c = makeClassifier(network);
    await expect(c.classify('vienes mañana')).resolves.toBe(true);
    expect(network.postJson).toHaveBeenCalledTimes(1);
  });

  it('returns false when HF top label is "statement"', async () => {
    const network = { postJson: jest.fn().mockResolvedValue([
      { label: 'statement', score: 0.95 },
      { label: 'question',  score: 0.05 },
    ]) };
    const c = makeClassifier(network);
    await expect(c.classify('going to sleep')).resolves.toBe(false);
  });

  it('falls back to heuristic on timeout', async () => {
    const network = { postJson: jest.fn().mockRejectedValue(new NetworkTimeoutError('http://x', 500)) };
    const c = makeClassifier(network);
    // "wanna" → heuristic flags as question
    await expect(c.classify('wanna grab coffee')).resolves.toBe(true);
    // Plain statement → heuristic returns false
    await expect(c.classify('I am tired')).resolves.toBe(false);
  });

  it('falls back to heuristic on HTTP error', async () => {
    const network = { postJson: jest.fn().mockRejectedValue(new NetworkHttpError('http://x', 503, 'busy')) };
    const c = makeClassifier(network);
    await expect(c.classify('How are you?')).resolves.toBe(true);
  });

  it('falls back to heuristic when HF returns empty array', async () => {
    const network = { postJson: jest.fn().mockResolvedValue([]) };
    const c = makeClassifier(network);
    await expect(c.classify('Hey?')).resolves.toBe(true);
  });

  it('skips HF entirely when token is missing', async () => {
    const network = { postJson: jest.fn() };
    // Empty string bypasses both the helper's default and the `?? process.env` fallback.
    const c = makeClassifier(network, '');
    await expect(c.classify('How are you?')).resolves.toBe(true);
    expect(network.postJson).not.toHaveBeenCalled();
  });

  it('per-call timeoutMs option overrides constructor default', async () => {
    const network = { postJson: jest.fn().mockResolvedValue([{ label: 'question', score: 1 }]) };
    const c = makeClassifier(network);
    await c.classify('Hey?', undefined, { timeoutMs: 9_999 });
    const [, , options] = network.postJson.mock.calls[0];
    expect(options.timeoutMs).toBe(9_999);
  });
});
