// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

import { useState } from 'react';

import { AddAttachmentModal } from '@/components/modals';
import { UserRole, useHasMinRole } from '@/lib/auth';

/**
 * The add-attachment dialog, held by the page rather than the attachment
 * panel: the panel remounts when it moves between the sidebar and the main
 * column at the lg breakpoint, and the files picked in the dialog must
 * survive that. Keyed by card, so files picked for one card are never
 * offered for the next.
 */
export function useAddAttachmentDialog(cardKey: string) {
  const [openFor, setOpenFor] = useState<string | null>(null);
  const canEdit = useHasMinRole(UserRole.Editor);
  return {
    open: () => setOpenFor(cardKey),
    dialog: canEdit && (
      <AddAttachmentModal
        key={cardKey}
        open={openFor === cardKey}
        onClose={() => setOpenFor(null)}
        cardKey={cardKey}
      />
    ),
  };
}
