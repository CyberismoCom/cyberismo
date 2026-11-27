// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

import { useMemo, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Link as RouterLink, useParams } from 'react-router';
import { Box, Card, Stack, Typography } from '@mui/joy';
import ArrowForwardRounded from '@mui/icons-material/ArrowForwardRounded';
import SectionHeading from '@/components/config-editors/SectionHeading';
import { useResourceTree } from '@/lib/api';
import { RESOURCES } from '@/lib/constants';
import { countResources, type ResourceCount } from '@/lib/resourceCounts';

function LinkCard({
  to,
  dataCy,
  children,
}: {
  to: string;
  dataCy: string;
  children: ReactNode;
}) {
  return (
    <Card
      variant="outlined"
      size="sm"
      component={RouterLink}
      to={to}
      data-cy={dataCy}
      sx={(theme) => ({
        gap: 0.5,
        textDecoration: 'none',
        '&:hover': { bgcolor: 'background.level1' },
        [theme.focus.selector]: theme.focus.default,
      })}
    >
      {children}
    </Card>
  );
}

function LinkCardTitle({ title, total }: { title: string; total?: number }) {
  return (
    <Stack direction="row" alignItems="center" spacing={1}>
      <Typography level="title-md" noWrap sx={{ flex: 1, minWidth: 0 }}>
        {title}
      </Typography>
      {total !== undefined && (
        <Typography
          level="title-sm"
          textColor="text.secondary"
          sx={{ fontVariantNumeric: 'tabular-nums' }}
        >
          {total}
        </Typography>
      )}
      {/* A Material icon does not read the Joy palette, so name the variable. */}
      <ArrowForwardRounded
        sx={{ fontSize: 16, color: 'var(--joy-palette-text-icon)' }}
      />
    </Stack>
  );
}

function CountLine({ count }: { count: ResourceCount }) {
  const { t } = useTranslation();
  const parts: string[] = [];
  if (count.project > 0) {
    parts.push(t('configOverview.inProject', { count: count.project }));
  }
  if (count.modules > 0) {
    parts.push(
      count.moduleNames.length === 1
        ? t('configOverview.fromModule', {
            count: count.modules,
            module: count.moduleNames[0],
          })
        : t('configOverview.fromModules', {
            count: count.modules,
            modules: count.moduleNames.length,
          }),
    );
  }
  return (
    <Typography
      level="body-xs"
      textColor="text.tertiary"
      sx={{ fontVariantNumeric: 'tabular-nums' }}
    >
      {parts.length > 0 ? parts.join(', ') : t('configOverview.none')}
    </Typography>
  );
}

function Detail({ label, children }: { label: string; children: ReactNode }) {
  return (
    <Stack>
      <Typography level="body-xs" textColor="text.tertiary">
        {label}
      </Typography>
      <Typography level="body-sm" textColor="text.primary">
        {children}
      </Typography>
    </Stack>
  );
}

export default function Configuration() {
  const { t } = useTranslation();
  const { projectPrefix } = useParams();
  const { resourceTree, isLoading, loadError } = useResourceTree();
  const counts = useMemo(() => countResources(resourceTree), [resourceTree]);
  const generalNode = resourceTree.find((node) => node.type === 'general');
  const general = generalNode?.type === 'general' ? generalNode : undefined;
  const basePath = `/projects/${projectPrefix}/configuration`;

  return (
    <Stack height="100%" minHeight={0}>
      <Stack
        flexGrow={1}
        minHeight={0}
        padding={3}
        spacing={3}
        sx={{ overflow: 'auto' }}
      >
        <Box>
          <Typography level="h3" component="h1">
            {t('configuration')}
          </Typography>
          <Typography
            level="body-sm"
            textColor="text.secondary"
            sx={{ mt: 1, maxWidth: '62ch' }}
          >
            {t('configOverview.intro')}
          </Typography>
        </Box>

        {isLoading ? (
          <Typography level="body-sm">{t('loading')}</Typography>
        ) : loadError ? (
          // Without the tree every count would read "None yet".
          <Typography level="body-sm" color="danger">
            {loadError.message ?? t('failedToLoad')}
          </Typography>
        ) : (
          <>
            {general && (
              <LinkCard
                to={`${basePath}/general`}
                dataCy="configOverview-general"
              >
                <LinkCardTitle title={t('resources.general')} />
                <Stack direction="row" flexWrap="wrap" columnGap={6} rowGap={1}>
                  <Detail label={t('general.projectName')}>
                    {general.data.name}
                  </Detail>
                  <Detail label={t('general.cardKeyPrefix')}>
                    <Box component="span" sx={{ fontFamily: 'code' }}>
                      {general.data.cardKeyPrefix}
                    </Box>
                  </Detail>
                  <Detail label={t('general.modulesSection')}>
                    {general.data.modules.length > 0
                      ? general.data.modules
                          .map((module) => module.name)
                          .join(', ')
                      : t('configOverview.noModules')}
                  </Detail>
                </Stack>
              </LinkCard>
            )}

            <Box>
              <SectionHeading
                title={t('configOverview.resourceTypes')}
                component="h2"
              />
              <Box
                display="grid"
                gap={2}
                sx={{
                  gridTemplateColumns: {
                    xs: 'minmax(0, 1fr)',
                    sm: 'repeat(2, minmax(0, 1fr))',
                    lg: 'repeat(3, minmax(0, 1fr))',
                  },
                }}
              >
                {RESOURCES.map((resource) => {
                  const count = counts[resource];
                  const total = count.project + count.modules;
                  return (
                    <LinkCard
                      key={resource}
                      to={`${basePath}/${resource}`}
                      dataCy={`configOverview-${resource}`}
                    >
                      <LinkCardTitle
                        title={t(`resources.${resource}`)}
                        total={total > 0 ? total : undefined}
                      />
                      <Typography level="body-sm" textColor="text.secondary">
                        {t(`configOverview.descriptions.${resource}`)}
                      </Typography>
                      <CountLine count={count} />
                    </LinkCard>
                  );
                })}
              </Box>
            </Box>
          </>
        )}
      </Stack>
    </Stack>
  );
}
