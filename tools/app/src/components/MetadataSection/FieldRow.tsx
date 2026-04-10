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

import { Accordion, AccordionDetails } from '@mui/joy';
import type { DataType, MetadataValue } from '../../lib/definitions';
import type { EnumDefinition } from '@cyberismo/data-handler/types/queries';
import EditableField from '../EditableField';

export interface FieldRowProps {
  expanded?: boolean;
  value: MetadataValue | null | undefined;
  label: string;
  dataType: DataType | 'label';
  description?: string;
  enumValues?: EnumDefinition[];
}

export function FieldRow({
  expanded,
  value,
  label,
  dataType,
  description,
  enumValues,
}: FieldRowProps) {
  return (
    <Accordion
      expanded={expanded}
      sx={{
        borderLeft: '3px solid',
        borderColor: 'neutral.300',
        paddingX: 0.5,
        marginY: expanded ? 0.5 : 0,
      }}
    >
      <AccordionDetails>
        <EditableField
          value={value ?? ''}
          label={label}
          dataType={dataType}
          description={description}
          enumValues={enumValues}
          edit={false}
        />
      </AccordionDetails>
    </Accordion>
  );
}
