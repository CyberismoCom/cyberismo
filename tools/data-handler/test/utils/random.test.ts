import { expect, describe, it } from 'vitest';
import { generateRandomString } from '../../src/utils/random.js';

describe('generate random string', () => {
  it('base36', () => {
    const base36Regex = /^[0-9a-z]+$/;
    const result = generateRandomString(36, 8);
    expect(result.length).toBe(8);
    expect(result).toMatch(base36Regex);

    const result2 = generateRandomString(36, 1);
    expect(result2.length).toBe(1);
    expect(result2).toMatch(base36Regex);

    const result3 = generateRandomString(36, 15);
    expect(result3.length).toBe(15);
    expect(result3).toMatch(base36Regex);
  });

  it('base10', () => {
    const base10Regex = /^[0-9]+$/;
    const result = generateRandomString(10, 8);
    expect(result.length).toBe(8);
    expect(result).toMatch(base10Regex);

    const result2 = generateRandomString(10, 1);
    expect(result2.length).toBe(1);
    expect(result2).toMatch(base10Regex);

    const result3 = generateRandomString(10, 15);
    expect(result3.length).toBe(15);
    expect(result3).toMatch(base10Regex);
  });

  it('base16', () => {
    const base16Regex = /^[0-9a-f]+$/;
    const result = generateRandomString(16, 8);
    expect(result.length).toBe(8);
    expect(result).toMatch(base16Regex);

    const result2 = generateRandomString(16, 1);
    expect(result2.length).toBe(1);
    expect(result2).toMatch(base16Regex);

    const result3 = generateRandomString(16, 15);
    expect(result3.length).toBe(15);
    expect(result3).toMatch(base16Regex);
  });
});
