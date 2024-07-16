/**
    Cyberismo
    Copyright © Cyberismo Ltd and contributors 2024

    This program is free software: you can redistribute it and/or modify it under the terms of the GNU Affero General Public License version 3 as published by the Free Software Foundation.

    This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Affero General Public License for more details.

    You should have received a copy of the GNU Affero General Public
    License along with this program.  If not, see <https://www.gnu.org/licenses/>.
*/

'use client';
import { Typography } from '@mui/joy';
import { useTranslation } from 'react-i18next';
import { useProject } from '../lib/api';

export const dynamic = 'force-dynamic';

export default function CardsPage() {
  const { t } = useTranslation();
  const { project } = useProject();
  return (
    <Typography level="title-md">
      {project && project.cards.length > 0
        ? t('selectCard')
        : t('emptyProject')}
    </Typography>
  );
}
