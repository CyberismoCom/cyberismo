// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

import { useState } from 'react';

/**
 * Hook for managing editing state in list editors.
 * Tracks which item is being edited and which item is pending deletion.
 */
export function useListItemEditing<T>() {
  const [editingItem, setEditingItem] = useState<string | null>(null);
  const [itemToDelete, setItemToDelete] = useState<T | null>(null);

  return {
    editingItem,
    itemToDelete,
    isEditingLocked: editingItem !== null,
    startEditing: setEditingItem,
    cancelEditing: () => setEditingItem(null),
    setItemToDelete,
    clearItemToDelete: () => setItemToDelete(null),
  };
}
