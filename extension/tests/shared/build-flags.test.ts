import { describe, expect, it } from 'vitest';
import { PRO_BUILD } from '../../src/shared/build-flags';

describe('PRO_BUILD', () => {
  it('is a boolean constant', () => {
    expect(typeof PRO_BUILD).toBe('boolean');
  });

  it('is false in the free (PromptGnome) build', () => {
    expect(PRO_BUILD).toBe(false);
  });
});
