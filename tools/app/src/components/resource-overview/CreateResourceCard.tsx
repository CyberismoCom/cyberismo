// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

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
