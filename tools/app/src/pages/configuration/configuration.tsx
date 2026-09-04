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
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Box, Sheet, Stack, Typography } from '@mui/joy';
import ArrowForwardRounded from '@mui/icons-material/ArrowForwardRounded';
import { Link as RouterLink, useParams } from 'react-router';
import { useResourceTree } from '@/lib/api';
import { useProject } from '@/lib/api/project';
import { RESOURCES } from '@/lib/constants';
import type { AnyNode } from '@/lib/api/types';

/** How many resources of each kind exist, and across how many modules. */
function countResources(tree: AnyNode[] | undefined) {
  const counts = new Map<string, { total: number; modules: Set<string> }>();
  if (!tree) return counts;

  const walk = (
    nodes: AnyNode[],
    group: string | null,
    module: string | null,
  ) => {
    for (const node of nodes) {
      const nextGroup = node.type === 'resourceGroup' ? node.name : group;
      const nextModule = node.type === 'module' ? node.name : module;
      // Leaf resources are the nodes whose type matches their group.
      if (nextGroup && node.type === nextGroup) {
        const entry = counts.get(nextGroup) ?? { total: 0, modules: new Set() };
        entry.total += 1;
        if (nextModule) entry.modules.add(nextModule);
        counts.set(nextGroup, entry);
      }
      if (node.children?.length) walk(node.children, nextGroup, nextModule);
    }
  };
  walk(tree, null, null);
  return counts;
}

export default function Configuration() {
  const { t } = useTranslation();
  const { projectPrefix } = useParams();
  const { resourceTree } = useResourceTree();
  const { project } = useProject();
  const counts = useMemo(() => countResources(resourceTree), [resourceTree]);

  return (
    <Box padding={4} maxWidth={960}>
      <Typography level="label">{t('configuration')}</Typography>
      <Typography level="h1" marginTop={0.5}>
        {project?.name}
      </Typography>
      <Typography
        level="body-md"
        textColor="text.secondary"
        marginTop={1.5}
        maxWidth="62ch"
      >
        {t('configOverview.intro')}
      </Typography>

      <Box
        marginTop={4}
        display="grid"
        gap={1.5}
        sx={{
          gridTemplateColumns: {
            xs: '1fr',
            sm: 'repeat(2, 1fr)',
            lg: 'repeat(3, 1fr)',
          },
        }}
      >
        {RESOURCES.map((resource) => {
          const entry = counts.get(resource);
          return (
            <Sheet
              key={resource}
              component={RouterLink}
              to={`/projects/${projectPrefix}/configuration/${resource}`}
              variant="outlined"
              data-cy={`configOverview-${resource}`}
              sx={{
                padding: 2,
                textDecoration: 'none',
                display: 'block',
                transition: 'border-color 0.15s ease-in-out',
                '&:hover': { borderColor: 'neutral.400' },
              }}
            >
              <Stack
                direction="row"
                alignItems="center"
                justifyContent="space-between"
                spacing={1}
              >
                <Typography level="title-md" noWrap>
                  {t(`resources.${resource}`)}
                </Typography>
                <ArrowForwardRounded
                  sx={{ fontSize: 16, color: 'text.tertiary' }}
                />
              </Stack>
              <Typography
                level="body-sm"
                textColor="text.tertiary"
                marginTop={0.5}
                sx={{ fontVariantNumeric: 'tabular-nums' }}
              >
                {entry
                  ? t('configOverview.count', {
                      count: entry.total,
                      modules: entry.modules.size,
                    })
                  : t('configOverview.empty')}
              </Typography>
            </Sheet>
          );
        })}
      </Box>
    </Box>
  );
}
