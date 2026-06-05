/**
  Cyberismo
  Copyright © Cyberismo Ltd and contributors 2026

  This program is free software: you can redistribute it and/or modify it under
  the terms of the GNU Affero General Public License version 3 as published by
  the Free Software Foundation. This program is distributed in the hope that it
  will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty
  of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.
  See the GNU Affero General Public License for more details.
  You should have received a copy of the GNU Affero General Public
  License along with this program. If not, see <https://www.gnu.org/licenses/>.
*/

import type { ReactNode } from 'react';
import { Box, Stack } from '@mui/joy';
import { CardTitle } from '@/components/card/CardTitle';
import MetadataView from '@/components/card/metadata-section/MetadataSection';
import { CardBody } from '@/components/card/CardBody';
import type { CardResponse } from '@/lib/api/types';

/**
 * Read-only render of the working draft, reusing the normal card-view
 * components (title, metadata, body) in their read-only mode. An optional
 * `header` (e.g. the Edit/Preview toggle) is rendered at the top.
 */
export function TemplateCardPreview({
  card,
  header,
}: {
  card: CardResponse;
  header?: ReactNode;
}) {
  return (
    <Box
      flexGrow={1}
      minHeight={0}
      padding={{ xs: 2, sm: 3 }}
      sx={{ overflowY: 'auto', scrollbarWidth: 'thin' }}
    >
      <Stack spacing={2}>
        {header}
        <CardTitle title={card.title} preview />
        <MetadataView initialExpanded card={card} />
        <CardBody card={card} preview />
      </Stack>
    </Box>
  );
}
