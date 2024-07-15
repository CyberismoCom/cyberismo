const ALPHABET = 'abcdefghijklmnopqrstuvwxyz';
const ALPHABET_SIZE = ALPHABET.length;

const PREFIX = '0|'; // prefix to allow easy addition of buckets later if required

export const FIRST_RANK = PREFIX + ALPHABET[0];
export const LAST_RANK = PREFIX + ALPHABET[ALPHABET_SIZE - 1];

export const EMPTY_RANK = `1|${ALPHABET[0]}`; // rank to be used when no rank is available

type Rank = string; // Rank is a string that represents a number in base 26

/**
 * Convert a number to base 26
 * @param num number to convert to base 26
 * @returns the string representation of the number in base 26
 */
export function enbase(num: number): string {
  if (num === 0) return ALPHABET[0];

  let result = '';
  while (num > 0) {
    result =
      String.fromCharCode(ALPHABET.charCodeAt(0) + (num % ALPHABET_SIZE)) +
      result;
    num = Math.floor(num / ALPHABET_SIZE);
  }
  return result;
}

/**
 * Convert a rank to a number
 * @param str rank to convert to a number
 * @returns the number representation of the rank
 */
export function debase(str: string): number {
  let result = 0;
  for (let i = 0; i < str.length; i++) {
    result +=
      (str.charCodeAt(i) - ALPHABET.charCodeAt(0)) *
      Math.pow(ALPHABET_SIZE, str.length - i - 1);
  }
  return result;
}

/**
 * Returns the next available rank after the given rank
 * @param rank rank to get the next rank after
 * @returns the next available rank after the given rank
 */
export function getRankAfter(rank: Rank): Rank {
  rank = rank.replace(PREFIX, '');
  let num = debase(rank);
  num++;
  const newRank = enbase(num);
  if (newRank.length > rank.length) {
    return PREFIX + rank + ALPHABET[ALPHABET_SIZE / 2];
  }
  return PREFIX + newRank;
}

/**
 * Get the rank between two ranks
 * Rank is a string that represents a number in base 26
 * Rank must be a string of lowercase letters
 * @param rank1 first rank
 * @param rank2 second rank
 * @returns the rank between the two ranks
 */
export function getRankBetween(rank1: string, rank2: string): string {
  // must be padded for the comparison

  rank1 = rank1.replace(PREFIX, '');
  rank2 = rank2.replace(PREFIX, '');

  const length = Math.max(rank1.length, rank2.length);

  // padding with 'a' to make the ranks equal length
  // since comparison is done lexicographically
  // it does not effect the comparison

  const paddedRank1 = rank1.padEnd(length, ALPHABET[0]);

  const paddedRank2 = rank2.padEnd(length, ALPHABET[0]);

  const num1 = debase(paddedRank1);
  const num2 = debase(paddedRank2);

  if (num1 >= num2) {
    throw new Error('Rank1 must be smaller than rank2');
  }

  const res = enbase(Math.floor((num1 + num2) / 2)).padStart(
    length,
    ALPHABET[0],
  );
  if (res !== paddedRank1 && res !== paddedRank2) {
    return PREFIX + res;
  }
  return PREFIX + res + ALPHABET[ALPHABET_SIZE / 2];
}

/**
 * Rebalance the ranks so that the distance between each rank is equal
 * @param rankAmount number of ranks to rebalance
 * @returns rebalanced ranks
 */
export function rebalanceRanks(rankAmount: number): string[] {
  if (rankAmount === 0) return [];
  if (rankAmount === 1) return [FIRST_RANK];
  const requiredLevels = Math.ceil(
    Math.log(rankAmount) / Math.log(ALPHABET_SIZE),
  );
  // set minumum rank consisting of all 'a's and maximum rank consisting of all 'z's
  const minRank = ALPHABET[0].repeat(requiredLevels);
  const maxRank = ALPHABET[ALPHABET_SIZE - 1].repeat(requiredLevels);

  // step size determines the distance between each rank
  const stepSize = Math.floor(debase(maxRank) / (rankAmount - 1));

  const ranks = [];
  for (let i = 0; i < rankAmount; i++) {
    if (i === 0) {
      ranks.push(PREFIX + minRank);
    } else if (i === rankAmount - 1) {
      ranks.push(PREFIX + maxRank);
    } else {
      const rank = debase(minRank) + stepSize * i;
      ranks.push(PREFIX + enbase(rank));
    }
  }
  return ranks;
}

/**
 * Sort items based on lexorank
 * @param items items to sort
 * @param rankGetter should return the lexorank of the item
 * @returns sorted items
 */
export function sortItems<T>(items: T[], rankGetter: (item: T) => string): T[] {
  if (items.length === 0) return items;
  return items.sort((a, b) => compare(rankGetter(a), rankGetter(b)));
}

/**
 * default compare function
 * @param a first string
 * @param b second string
 * @returns -1 if a < b, 0 if a === b, 1 if a > b
 */
export function compare(a: string, b: string): number {
  return a.localeCompare(b);
}
