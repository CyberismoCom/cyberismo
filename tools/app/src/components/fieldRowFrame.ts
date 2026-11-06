// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

/** Row width for side by side; not Joy's md, as it measures the row, not the window. */
const ROW_CONTAINER_MIN_WIDTH = '30rem';

/** The query, against the row's nearest size container, that is true when the row layout applies. */
export const rowQuery = `@container (min-width: ${ROW_CONTAINER_MIN_WIDTH})`;

/** Stack styles of a label and its value in a size container. */
export const containerRowSx = {
  gap: 0.5,
  [rowQuery]: { flexDirection: 'row', gap: 4 },
} as const;

/** Width of whatever follows the label: full width when stacked. */
export const rowValueWidthSx = {
  width: '100%',
  [rowQuery]: { width: 'auto' },
} as const;

/** The rule and margins of a read-mode row; shared so other rows line up with it. */
export const fieldRowFrameSx = {
  borderLeft: '3px solid',
  borderColor: 'neutral.300',
  paddingX: 0.5,
  marginY: 0.5,
} as const;

/**
 * The outline of the metadata panel; a field macro's row box wears the same.
 * It is a size container, so the rows inside lay out by its width.
 */
export const metadataBoxSx = {
  containerType: 'inline-size',
  border: '1px solid',
  borderColor: 'neutral.outlinedBorder',
  borderRadius: 6,
  padding: { xs: 1, sm: 1.5 },
} as const;
