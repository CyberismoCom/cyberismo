// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

import type { ReactNode } from 'react';

/** The card a field macro reads and edits, when it is not the page's own. */
export interface FieldTarget {
  key: string;
  title: string;
}

export const targetLabel = ({ key, title }: FieldTarget) => `${key} · ${title}`;

/** One tooltip from the lines that apply; none when none do. */
export function tooltipLines(...lines: (string | undefined)[]): ReactNode {
  const shown = lines.filter((line): line is string => !!line);
  return shown.length === 0
    ? undefined
    : shown.map((line, i) => <div key={i}>{line}</div>);
}
