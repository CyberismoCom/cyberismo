/**
  Cyberismo
  Copyright © Cyberismo Ltd and contributors 2026
  This program is free software: you can redistribute it and/or modify it under
  the terms of the GNU Affero General Public License version 3 as published by
  the Free Software Foundation.
  This program is distributed in the hope that it will be useful, but WITHOUT
  ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS
  FOR A PARTICULAR PURPOSE. See the GNU Affero General Public License for more
  details. You should have received a copy of the GNU Affero General Public
  License along with this program. If not, see <https://www.gnu.org/licenses/>.
*/
import { Box } from '@mui/joy';
import { DENSITY } from '../theme';
import { getProgressColor } from '../lib/utils';

interface ProgressMeterProps {
  /** Completion percentage, 0–100. */
  value: number;
  /**
   * Overrides the bar fill. Defaults to a colour derived from `value`, since
   * cards carrying progress have no workflow state of their own.
   */
  color?: string;
  /** Hide the bar and show the figure alone, for very narrow containers. */
  figureOnly?: boolean;
}

/**
 * Completion shown as an exact percentage in a reserved, non-shrinking column,
 * with an optional bar behind it.
 *
 * The figure is the value and the bar is the gloss: colour tells you roughly
 * where something is, but only the number tells you that Design moved from 12%
 * to 14%. So the figure is never abbreviated, never rounded to a bucket and
 * never hidden behind a hover — under width pressure the caller's label
 * truncates and the bar collapses to its minimum, and the figure is the last
 * thing standing.
 */
export function ProgressMeter({
  value,
  color,
  figureOnly = false,
}: ProgressMeterProps) {
  const clamped = Math.max(0, Math.min(100, Math.round(value)));
  const fill = color ?? getProgressColor(clamped);
  return (
    <Box
      display="flex"
      alignItems="center"
      gap="6px"
      flex="none"
      paddingLeft="8px"
      marginLeft="auto"
    >
      {!figureOnly && (
        <Box
          aria-hidden
          sx={{
            // 44px is wide enough that a 14% fill is actually perceptible.
            // Measured against both demo projects, widening from 26px to 44px
            // costs nothing in truncation (32/164 labels either way at the
            // default rail) because the rows that carry a bar have short
            // titles — progress lives on projects and phases.
            width: 44,
            minWidth: 20,
            height: '3px',
            flex: 'none',
            overflow: 'hidden',
            bgcolor: 'background.level2',
          }}
        >
          <Box sx={{ width: `${clamped}%`, height: '100%', bgcolor: fill }} />
        </Box>
      )}
      <Box
        component="span"
        sx={{
          // Reserved column, wide enough for "100%", so digits stay aligned
          // down the whole tree at every indent level.
          flex: `0 0 ${DENSITY.figureColumn}px`,
          width: `${DENSITY.figureColumn}px`,
          textAlign: 'right',
          fontSize: '11.5px',
          fontWeight: 800,
          fontVariantNumeric: 'tabular-nums',
          color: 'text.secondary',
        }}
      >
        {clamped}%
      </Box>
    </Box>
  );
}

export default ProgressMeter;
