// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

import { Link } from '@mui/joy';
import { Link as RouterLink } from 'react-router';
import { targetLabel } from './fieldTarget';
import type { FieldTarget } from './fieldTarget';

/** Names the card an edit lands on, with a link to it. */
export default function TargetLink({ target }: { target: FieldTarget }) {
  return (
    <Link
      data-cy="fieldMacroTarget"
      component={RouterLink}
      to={`/cards/${target.key}`}
      level="body-xs"
    >
      {targetLabel(target)}
    </Link>
  );
}
