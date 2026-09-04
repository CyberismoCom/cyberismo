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
import { getStateColor } from '../lib/utils';

interface StatusChipProps {
  /** Workflow category, or `error` for a failed policy check. */
  category: string | undefined;
  children: React.ReactNode;
}

/**
 * A workflow state, carried by a 3px rail on the leading edge.
 *
 * The rail is the app's one state device: it appears here, on the card header,
 * on tree rows and on linked-item rows, so the same state reads identically
 * everywhere. Encoding state in form as well as colour keeps it legible in
 * greyscale, in print and for colour-blind users.
 */
export function StatusChip({ category, children }: StatusChipProps) {
  return (
    <Box
      component="span"
      sx={{
        display: 'inline-flex',
        alignItems: 'center',
        fontSize: '11px',
        fontWeight: 800,
        letterSpacing: '0.08em',
        textTransform: 'uppercase',
        padding: '5px 10px',
        borderRadius: '2px',
        border: '1px solid',
        borderColor: 'divider',
        borderLeft: '3px solid',
        borderLeftColor: getStateColor(category),
        bgcolor: 'background.surface',
        color: 'text.primary',
        whiteSpace: 'nowrap',
      }}
    >
      {children}
    </Box>
  );
}

export default StatusChip;
