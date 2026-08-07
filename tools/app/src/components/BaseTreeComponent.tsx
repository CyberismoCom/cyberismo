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

import { useEffect, useRef, useCallback } from 'react';
import { Link as JoyLink, Stack, Typography } from '@mui/joy';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import type { NodeRendererProps, NodeApi, TreeApi } from 'react-arborist';
import { Tree } from 'react-arborist';
import { Link } from 'react-router';
import { useResizeObserver } from '../lib/hooks';
import { UserRole, useHasMinRole } from '@/lib/auth';

export interface BaseTreeProps<T> {
  title?: string;
  titleRightSlot?: React.ReactNode;
  linkTo?: string;
  /** When set, renders a back link above the title that calls this handler. */
  onBackClick?: () => void;
  /** Visible label for the back link. Defaults to "Back". */
  backLabel?: string;
  data: T[] | null;
  selectedId?: string | null;
  nodeRenderer: React.ComponentType<
    NodeRendererProps<T> & { onNodeClick?: (node: NodeApi<T>) => void }
  >;
  idAccessor?: string | ((node: T) => string);
  childrenAccessor?: string | ((node: T) => T[]);
  onMove?: (dragIds: string[], parentId: string | null, index: number) => void;
  onNodeClick?: (node: NodeApi<T>) => void;
  openByDefault?: boolean;
  /** Disable drag & drop regardless of the user's edit role. */
  readOnly?: boolean;
}

export function BaseTreeComponent<T>({
  title,
  titleRightSlot,
  linkTo,
  onBackClick,
  backLabel = 'Back',
  data,
  selectedId,
  nodeRenderer: NodeRenderer,
  idAccessor,
  childrenAccessor = 'children',
  onMove,
  onNodeClick,
  openByDefault = false,
  readOnly = false,
}: BaseTreeProps<T>) {
  const treeRef = useRef(null);
  const { width, height, ref } = useResizeObserver();
  const { height: titleHeight, ref: titleRef } = useResizeObserver();
  const canEdit = useHasMinRole(UserRole.Editor) && !readOnly;

  // Undefined until the container has been measured. react-arborist falls back
  // to a 500px viewport when height is missing, so the tree is only rendered
  // once the real height is known — see the effect below.
  const listHeight =
    height === undefined ? undefined : Math.max(0, height - (titleHeight ?? 0));

  useEffect(() => {
    const tree = treeRef.current as unknown as TreeApi<T> | null;
    // Selecting scrolls the node into view, and react-window computes that
    // scroll offset from the height it currently has. Against the 500px
    // fallback it can compute an offset the real (taller) viewport cannot
    // scroll to; the browser clamps the scrollTop assignment, no scroll event
    // fires, and react-window keeps rendering rows for the offset it thinks it
    // has — leaving a blank gap above them. So wait for the measured height.
    if (listHeight === undefined) return;
    if (selectedId && tree && !tree.selectedIds.has(selectedId)) {
      tree.openParents(selectedId);
      tree.open(selectedId);
      tree.update(tree.props);
      tree.select(selectedId);
    }
  }, [selectedId, listHeight]);

  const handleMove = useCallback(
    (moveData: {
      dragIds: string[];
      parentId: string | null;
      index: number;
    }) => {
      if (onMove && moveData.dragIds.length === 1) {
        onMove(moveData.dragIds, moveData.parentId, moveData.index);
      }
    },
    [onMove],
  );

  // react-arborist remounts rows when this ref changes, aborting in-progress drags.
  const renderNode = useCallback(
    (props: NodeRendererProps<T>) => (
      <NodeRenderer {...props} onNodeClick={onNodeClick} />
    ),
    [NodeRenderer, onNodeClick],
  );

  return (
    <Stack
      paddingTop={2}
      paddingLeft={3}
      bgcolor="background.surface"
      height="100%"
      width="100%"
      ref={ref}
    >
      {title && (
        <Stack
          flexWrap="nowrap"
          flexDirection="row"
          justifyContent="space-between"
          alignItems="flex-start"
        >
          <Stack alignItems="flex-start" ref={titleRef}>
            {onBackClick && (
              <JoyLink
                data-cy="configBackButton"
                component="button"
                type="button"
                level="body-sm"
                color="neutral"
                startDecorator={<ArrowBackIcon fontSize="small" />}
                onClick={onBackClick}
                sx={{ marginBottom: 0.5 }}
              >
                {backLabel}
              </JoyLink>
            )}
            <Link to={linkTo || ''} style={{ textDecoration: 'none' }}>
              <Typography level="h4" marginBottom={2}>
                {title}
              </Typography>
            </Link>
          </Stack>
          {titleRightSlot}
        </Stack>
      )}
      {listHeight !== undefined && (
        <Tree
          ref={treeRef}
          data={data || []}
          openByDefault={openByDefault}
          disableDrag={
            !canEdit || !onMove
              ? true
              : (node: T) => (node as { readOnly?: boolean })?.readOnly === true
          }
          disableDrop={
            !canEdit || !onMove
              ? true
              : ({ parentNode }) =>
                  (parentNode?.data as { readOnly?: boolean })?.readOnly ===
                  true
          }
          idAccessor={idAccessor}
          childrenAccessor={childrenAccessor}
          indent={16}
          width={width}
          height={listHeight}
          rowHeight={28}
          onMove={handleMove}
        >
          {renderNode}
        </Tree>
      )}
    </Stack>
  );
}
