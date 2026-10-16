// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

import { useMemo } from 'react';
import type { NodeApi } from 'react-arborist';

interface TreeNodeVisualState {
  backgroundColor: string;
  borderStyle: { border?: string; borderColor?: string };
  opacity: number;
  cursor: string;
}

/**
 * Hook to compute visual state for tree nodes during drag-and-drop operations.
 * Provides consistent styling for dragging, drop target, and selected states.
 *
 * @param node - The react-arborist node API
 * @returns Visual state object with backgroundColor, borderStyle, opacity, and cursor
 */
export function useTreeNodeVisualState<T>(
  node: NodeApi<T>,
): TreeNodeVisualState {
  return useMemo(() => {
    const isDropTarget = node.state?.willReceiveDrop || false;
    const isDragging = node.state?.isDragging || false;
    const isDragEnabled = !node.tree.props.disableDrag;

    return {
      backgroundColor: isDropTarget
        ? 'primary.softBg'
        : isDragging
          ? 'neutral.softBg'
          : node.isSelected
            ? 'background.body'
            : 'transparent',
      borderStyle: isDropTarget
        ? { border: '2px solid', borderColor: 'primary.500' }
        : {},
      opacity: isDragging ? 0.5 : 1,
      cursor: !isDragEnabled ? 'pointer' : isDragging ? 'grabbing' : 'grab',
    };
  }, [
    node.state?.willReceiveDrop,
    node.state?.isDragging,
    node.isSelected,
    node.tree.props.disableDrag,
  ]);
}
