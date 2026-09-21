/**
    Cyberismo
    Copyright © Cyberismo Ltd and contributors 2024

    This program is free software: you can redistribute it and/or modify it under the terms of the GNU Affero General Public License version 3 as published by the Free Software Foundation.

    This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Affero General Public License for more details.

    You should have received a copy of the GNU Affero General Public
    License along with this program.  If not, see <https://www.gnu.org/licenses/>.
*/

import type { ReactNode } from 'react';
import { Stack, Tooltip, Typography } from '@mui/joy';
import type { DataType, MetadataValue } from '../lib/definitions';
import FieldEditor from './FieldEditor';
import { metadataValueToString } from '../lib/utils';
import { useTranslation } from 'react-i18next';
import type { EnumDefinition } from '@cyberismo/data-handler/types/queries';
import InfoOutlined from '@mui/icons-material/InfoOutlined';
import LockOutlined from '@mui/icons-material/LockOutlined';

export type FieldLabelProps = {
  label: string;
  description?: string;
  disabled?: boolean;
  edit: boolean;
  /**
   * Draw the padlock inline. A caller that positions its own — because it
   * hangs the lock outside a container that clips, like Joy's AccordionDetails
   * — passes false and renders it itself.
   */
  renderLock?: boolean;
};

export function FieldLabel({
  label,
  description,
  disabled,
  edit,
  renderLock = true,
}: FieldLabelProps) {
  return (
    <Typography
      // Sentence case, not the uppercase `label` eyebrow. Eyebrows work as
      // section headers — few, short, isolated. As a row label in a dense
      // key/value list they fail three ways: uppercase with 0.09em tracking is
      // ~38% wider, so "Information classification" (144px) becomes 199px and
      // wraps in the 150px column; at weight 800 the label out-weighs its own
      // value (700) and inverts the hierarchy; and uppercase destroys the word
      // shape that makes a repeated column scannable.
      level="body-xs"
      textColor="text.tertiary"
      sx={{
        whiteSpace: 'normal',
        // Labels run to 54 characters in the demo projects, so wrapping cannot
        // be designed away — it has to be graceful. 168px is where the curve
        // flattens: of 99 real field labels it fits 86 on one line instead of
        // 71 at 150px, and the padlock and info icons sit inside this box, so
        // an icon costs ~18px of it. `pretty` keeps a wrapped label from
        // ending on an orphan word.
        textWrap: 'pretty',
        position: 'relative',
        width: { xs: '100%', md: '40%' },
        maxWidth: { md: 168 },
        flexShrink: 0,
      }}
    >
      {disabled && !edit && renderLock && (
        <LockOutlined
          sx={{
            height: 14,
            width: 14,
            mr: 0.5,
            verticalAlign: 'text-bottom',
            color: 'neutral.500',
          }}
        />
      )}
      {label}
      {description && (
        <Tooltip
          title={description}
          color="neutral"
          variant="outlined"
          disableInteractive
        >
          <InfoOutlined
            sx={{
              position: 'absolute',
              height: 16,
              width: 16,
              ml: 0.5,
              color: 'var(--joy-palette-text-tertiary)',
            }}
          />
        </Tooltip>
      )}
    </Typography>
  );
}

export type EditableFieldProps = {
  value: MetadataValue;
  dataType: DataType | 'label';
  description?: string;
  label: string;
  onChange?: (value: string | string[] | null) => void;
  edit: boolean;
  disabled?: boolean;
  enumValues?: EnumDefinition[];
  focus?: boolean;
  /** Rendered inline after the read-mode value, e.g. the overridden marker. */
  valueDecorator?: ReactNode;
  /** See `FieldLabelProps.renderLock`. */
  renderLock?: boolean;
};

const EditableField = ({
  value,
  onChange,
  edit,
  label,
  dataType,
  description,
  enumValues,
  disabled,
  focus,
  valueDecorator,
  renderLock,
}: EditableFieldProps) => {
  const { t } = useTranslation();
  return (
    <Stack
      direction={{ xs: 'column', md: 'row' }}
      spacing={{ xs: 0.5, md: 4 }}
      // Align first lines: either side can wrap independently, and a
      // two-line label next to a one-line value must still read as one row.
      alignItems={{ xs: 'stretch', md: 'flex-start' }}
    >
      <FieldLabel
        label={label}
        description={description}
        disabled={disabled}
        edit={edit}
        renderLock={renderLock}
      />
      {edit ? (
        <FieldEditor
          value={value}
          onChange={onChange}
          dataType={dataType}
          enumValues={enumValues}
          disabled={disabled}
          focus={focus}
        />
      ) : (
        <Typography
          level="body-xs"
          fontWeight="bold"
          color={disabled ? 'neutral' : 'primary'}
          whiteSpace={dataType === 'longText' ? 'pre-line' : 'normal'}
        >
          {dataType === 'label'
            ? (value as string[] | null)?.join(', ')
            : metadataValueToString(value, dataType, t, enumValues)}
          {valueDecorator}
        </Typography>
      )}
    </Stack>
  );
};

export default EditableField;
