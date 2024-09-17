import { expect } from 'chai';
import { generateRandomString } from '../../src/utils/random.js';

describe('generate random string', () => {
  it('base36', () => {
    const base36Regex = /^[0-9a-z]+$/;
    const result = generateRandomString(36, 8);
    expect(result.length).to.equal(8);
    expect(result).to.match(base36Regex);

    const result2 = generateRandomString(36, 1);
    expect(result2.length).to.equal(1);
    expect(result2).to.match(base36Regex);

    const result3 = generateRandomString(36, 15);
    expect(result3.length).to.equal(15);
    expect(result3).to.match(base36Regex);
  });

  it('base10', () => {
    const base10Regex = /^[0-9]+$/;
    const result = generateRandomString(10, 8);
    expect(result.length).to.equal(8);
    expect(result).to.match(base10Regex);

    const result2 = generateRandomString(10, 1);
    expect(result2.length).to.equal(1);
    expect(result2).to.match(base10Regex);

    const result3 = generateRandomString(10, 15);
    expect(result3.length).to.equal(15);
    expect(result3).to.match(base10Regex);
  });

  it('base16', () => {
    const base16Regex = /^[0-9a-f]+$/;
    const result = generateRandomString(16, 8);
    expect(result.length).to.equal(8);
    expect(result).to.match(base16Regex);

    const result2 = generateRandomString(16, 1);
    expect(result2.length).to.equal(1);
    expect(result2).to.match(base16Regex);

    const result3 = generateRandomString(16, 15);
    expect(result3.length).to.equal(15);
    expect(result3).to.match(base16Regex);
  });
});
