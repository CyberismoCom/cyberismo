/**
  Cyberismo
  Copyright © Cyberismo Ltd and contributors 2025
  This program is free software: you can redistribute it and/or modify it under
  the terms of the GNU Affero General Public License version 3 as published by
  the Free Software Foundation.
  This program is distributed in the hope that it will be useful, but WITHOUT
  ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS
  FOR A PARTICULAR PURPOSE. See the GNU Affero General Public License for more
  details. You should have received a copy of the GNU Affero General Public
  License along with this program. If not, see <https://www.gnu.org/licenses/>.
*/

import { useMemo } from 'react';
import type { NodeApi } from 'react-arborist';
import { config } from '@/lib/utils';

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
    const isDragEnabled = !config.staticMode;

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
      // Only show grab cursor when dragging is enabled
      cursor: !isDragEnabled ? 'pointer' : isDragging ? 'grabbing' : 'grab',
    };
  }, [node.state?.willReceiveDrop, node.state?.isDragging, node.isSelected]);
}
