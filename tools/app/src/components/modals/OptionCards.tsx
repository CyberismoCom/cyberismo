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

import { Typography, Grid, Checkbox, Radio } from '@mui/joy';
import { OptionCard } from '@/components/OptionCard';

interface CategoryOptionProps {
  category?: string;
  multiSelect?: boolean;
  onOptionSelect: (optionName: string) => void;
  options: {
    name: string;
    displayName?: string;
    disabled?: boolean;
    description: string;
    isChosen: boolean;
  }[];
}

export const CategoryOption = ({
  category,
  multiSelect,
  options,
  onOptionSelect,
}: CategoryOptionProps) => (
  <>
    {category && (
      <Typography level="title-sm" color="neutral">
        {category}
      </Typography>
    )}
    <Grid
      container
      spacing={2}
      columnGap={2}
      rowGap={2}
      justifyContent="flex-start"
      marginTop={2}
      marginBottom={4}
      marginLeft={0}
      paddingRight={1}
      paddingBottom={1}
    >
      {options.map((option) => (
        <OptionCard
          key={option.name}
          title={option.displayName ?? option.name}
          description={option.description}
          disabled={option.disabled}
          onClick={() => onOptionSelect(option.name)}
          action={
            multiSelect ? (
              <Checkbox checked={option.isChosen} variant="soft" />
            ) : (
              <Radio checked={option.isChosen} variant="soft" />
            )
          }
        />
      ))}
    </Grid>
  </>
);
