// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

/** Orders two texts by their code units. */
export const compareText = (a: string, b: string) =>
  a < b ? -1 : a > b ? 1 : 0;
