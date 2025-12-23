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

import { Box, Card, CardContent, Stack, Typography } from '@mui/joy';
import AddRounded from '@mui/icons-material/AddRounded';

export function CreateResourceCard({
  title,
  onClick,
}: {
  title: string;
  onClick: () => void;
}) {
  return (
    <Card
      variant="outlined"
      component="button"
      type="button"
      onClick={onClick}
      sx={{
        cursor: 'pointer',
        backgroundColor: 'inherit',
        paddingY: 0,
        marginY: 2,
        '&:hover': {
          backgroundColor: 'neutral.softBg',
          borderColor: 'primary.outlinedBorder',
        },
      }}
    >
      <CardContent>
        <Stack
          alignItems="center"
          justifyContent="space-around"
          spacing={0}
          height="100%"
          marginTop={1}
        >
          <Typography level="h3" component="p" color="primary">
            {title}
          </Typography>
          <Box
            sx={(theme) => ({
              width: '100%',
              border: '1px solid',
              borderColor: 'neutral.outlinedBorder',
              borderRadius: theme.radius.sm,
              padding: 1,
              display: 'flex',
              justifyContent: 'center',
              marginBottom: 1,
            })}
          >
            <AddRounded color="primary" />
          </Box>
        </Stack>
      </CardContent>
    </Card>
  );
}
