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

import { useMemo, useState } from 'react';
import { useParams, useSearchParams } from 'react-router';
import { Box, Stack, Typography } from '@mui/joy';
import { useTranslation } from 'react-i18next';
import { useResourceTree } from '@/lib/api';
import { RESOURCES, type ResourceName } from '@/lib/constants';
import type { AnyNode } from '@/lib/api/types';
import { useAppModals } from '@/lib/contexts/AppModalsContext';
import { useMediaQuery } from '@mui/material';
import { useTheme } from '@mui/material/styles';
import {
  CreateResourceCard,
  ModuleFilterBar,
  ResourceModuleSection,
  ResourceOverviewCard,
} from '@/components/resource-overview';

function identifier(name: string) {
  const parts = name.split('/');
  return parts[parts.length - 1] || name;
}

function isProjectModuleName(moduleName: string) {
  return moduleName.toLowerCase() === 'project';
}

function isResourceName(name: string): name is ResourceName {
  return (RESOURCES as readonly string[]).includes(name);
}

function parseModulesParam(param: string | null): string[] {
  if (!param) return [];
  return param
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

function getModuleResources(nodes: AnyNode[], resourceType: ResourceName) {
  return (nodes || [])
    .filter((n) => n.type === resourceType)
    .map((n) => {
      const resourceData = 'data' in n ? n.data : undefined;
      return {
        key: n.id,
        title:
          (resourceData as { displayName?: string } | undefined)?.displayName ||
          identifier(n.name),
        description: (resourceData as { description?: string } | undefined)
          ?.description,
        to: `/configuration/${n.name}`,
      };
    })
    .sort((a, b) => a.title.localeCompare(b.title));
}

function ResourceOverviewContent({
  typedResourceType,
  modules,
  filterOptions,
  selectedModules,
  onSelectedModulesChange,
}: {
  typedResourceType: ResourceName;
  modules: Extract<AnyNode, { type: 'module' }>[];
  filterOptions: Array<{ id: string; label: string }>;
  selectedModules: string[];
  onSelectedModulesChange: (next: string[]) => void;
}) {
  const { t } = useTranslation();
  const { openCreateResourceModal } = useAppModals();
  const [expandedModules, setExpandedModules] = useState<
    Record<string, boolean>
  >({});
  const theme = useTheme();
  const showTwoColumns = useMediaQuery(theme.breakpoints.up('md'));
  const showThreeColumns = useMediaQuery(theme.breakpoints.up('lg'));
  const cardsPerRow = showThreeColumns ? 3 : showTwoColumns ? 2 : 1;

  const modulesToShow = useMemo(() => {
    if (selectedModules.length === 0) return modules;
    const selectedSet = new Set(selectedModules);
    return modules.filter((m) => selectedSet.has(m.name));
  }, [modules, selectedModules]);

  const showAllByDefault = selectedModules.length > 0;

  return (
    <>
      <ModuleFilterBar
        options={filterOptions}
        selected={selectedModules}
        onChange={(next) => {
          if (next.length === 0) {
            setExpandedModules({});
          }
          onSelectedModulesChange(next);
        }}
      />

      <Stack spacing={3} sx={{ mt: 2 }}>
        {modulesToShow.map((mod) => {
          const isProject = isProjectModuleName(mod.name);
          const resources = getModuleResources(
            mod.children || [],
            typedResourceType,
          );
          const isExpanded =
            showAllByDefault || isProject || Boolean(expandedModules[mod.name]);
          const visible = isExpanded
            ? resources
            : resources.slice(0, cardsPerRow);

          const showViewMore =
            !showAllByDefault && !isProject && resources.length > cardsPerRow;

          const title = isProject ? t('overview.localProject') : mod.name;

          return (
            <ResourceModuleSection
              key={mod.name}
              title={title}
              showViewMore={showViewMore}
              expanded={Boolean(expandedModules[mod.name])}
              onToggleExpanded={() =>
                setExpandedModules((prev) => ({
                  ...prev,
                  [mod.name]: !prev[mod.name],
                }))
              }
            >
              <Box
                sx={{
                  display: 'grid',
                  gridTemplateColumns: {
                    sm: '1fr',
                    md: 'repeat(2, 1fr)',
                    lg: 'repeat(3, 1fr)',
                  },
                  gap: 2,
                }}
              >
                {isProject && (
                  <CreateResourceCard
                    title={t('overview.createNew', {
                      resourceType: t(
                        `newResourceModal.${typedResourceType}.name`,
                      ),
                    })}
                    onClick={() => openCreateResourceModal(typedResourceType)}
                  />
                )}
                {visible.map((r) => (
                  <ResourceOverviewCard
                    key={r.key}
                    title={r.title}
                    description={r.description}
                    to={r.to}
                  />
                ))}
              </Box>
            </ResourceModuleSection>
          );
        })}
      </Stack>
    </>
  );
}

export default function ResourceOverviewPage() {
  const { resourceType } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const { t } = useTranslation();
  const { resourceTree, isLoading } = useResourceTree();

  const typedResourceType =
    resourceType && isResourceName(resourceType) ? resourceType : null;

  const groupNode = useMemo(() => {
    if (!typedResourceType) return null;
    return (
      resourceTree?.find(
        (n) => n.type === 'resourceGroup' && n.name === typedResourceType,
      ) || null
    );
  }, [resourceTree, typedResourceType]);

  const modules = useMemo(() => {
    if (!groupNode?.children) return [];
    const moduleNodes = groupNode.children.filter(
      (n): n is Extract<AnyNode, { type: 'module' }> => n.type === 'module',
    );
    const project = moduleNodes.find((m) => isProjectModuleName(m.name));
    const rest = moduleNodes.filter((m) => !isProjectModuleName(m.name));
    return [...(project ? [project] : []), ...rest];
  }, [groupNode]);

  const filterOptions = useMemo(
    () =>
      modules.map((m) => ({
        id: m.name,
        label: isProjectModuleName(m.name) ? t('project') : m.name,
      })),
    [modules, t],
  );

  const moduleNamesSet = useMemo(
    () => new Set(modules.map((m) => m.name)),
    [modules],
  );

  const modulesParam = searchParams.get('modules') || '';
  const selectedModules = useMemo(() => {
    return parseModulesParam(modulesParam).filter((m) => moduleNamesSet.has(m));
  }, [moduleNamesSet, modulesParam]);

  if (!typedResourceType) {
    return <div>{t('invalidResource')}</div>;
  }

  if (isLoading) {
    return <div>{t('loading')}</div>;
  }

  if (!groupNode) {
    return <div>{t('invalidResource')}</div>;
  }

  const selectedModulesKey = selectedModules.join(',');

  return (
    <Stack height="100%" minHeight={0}>
      <Stack flexGrow={1} minHeight={0} padding={3} sx={{ overflow: 'auto' }}>
        <Typography level="h1" sx={{ mb: 1.5 }}>
          {t(`resources.${typedResourceType}`)}
        </Typography>

        <ResourceOverviewContent
          key={`${typedResourceType}:${selectedModulesKey}`}
          typedResourceType={typedResourceType}
          modules={modules}
          filterOptions={filterOptions}
          selectedModules={selectedModules}
          onSelectedModulesChange={(next) => {
            const nextParams = new URLSearchParams(searchParams);
            if (next.length === 0) {
              nextParams.delete('modules');
            } else {
              nextParams.set('modules', next.join(','));
            }
            setSearchParams(nextParams, { replace: true });
          }}
        />
      </Stack>
    </Stack>
  );
}
