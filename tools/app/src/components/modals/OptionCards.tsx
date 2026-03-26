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

import {
  Typography,
  Grid,
  Box,
  Card,
  CardOverflow,
  Radio,
  Stack,
} from '@mui/joy';

interface CategoryOptionProps {
  category?: string;
  onOptionSelect: (optionName: string) => void;
  options: {
    name: string;
    displayName?: string;
    description: string;
    isChosen: boolean;
  }[];
}

export const CategoryOption = ({
  category,
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
    >
      {options.map((option) => (
        <Card
          className="templateCard"
          variant="outlined"
          sx={{
            height: '200px',
            width: '200px',
            boxShadow: '0px 2px 2px 0px rgba(0, 0, 0, 0.5)',
            cursor: 'pointer',
            padding: 0,
            overflow: 'hidden',
            gap: 0,
            borderRadius: 16,
          }}
          onClick={() => onOptionSelect(option.name)}
        >
          <Stack
            direction="row"
            padding={0}
            height="50%"
            sx={{
              justifyContent: 'space-between',
            }}
          >
            <Typography
              level="title-sm"
              paddingLeft={2}
              fontWeight="bold"
              textOverflow="clip"
              marginTop="auto"
              marginBottom={1}
            >
              {option.displayName ?? option.name}
            </Typography>
            <Box padding={1} height="100%">
              <Radio checked={option.isChosen} variant="soft" />
            </Box>
          </Stack>
          <CardOverflow
            sx={{
              height: '50%',
            }}
          >
            <Box bgcolor="neutral.softBg" height="100%">
              <Typography
                level="body-xs"
                fontWeight="bold"
                paddingLeft={2}
                height="100%"
                paddingTop={1}
                sx={{
                  wordBreak: 'break-word',
                }}
              >
                {option.description}
              </Typography>
            </Box>
          </CardOverflow>
        </Card>
      ))}
    </Grid>
  </>
);
