/**
 * Returns a random string in given base with given length (padded with 0's if necessary)
 * @param {number} base which base to be used, e.g. 36 for base-36, must be an integer
 * @param {number} length length of string, must be an integer
 * @returns a random string
 * @throws if parameters are not integer numbers
 */
export function generateRandomString(base: number, length: number): string {
  if (!Number.isInteger(base) || !Number.isInteger(length)) {
    throw new Error('parameters must be integers');
  }

  // Generate a random number between 0 and given base max number - 1
  const maxBaseNumber = Math.pow(base, length);
  const randomNum = Math.floor(Math.random() * maxBaseNumber);

  // Convert the number to a given base string and pad it with leading zeros if necessary
  return randomNum.toString(base).padStart(length, '0');
}
