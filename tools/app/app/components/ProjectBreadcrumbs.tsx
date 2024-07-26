/**
    Cyberismo
    Copyright © Cyberismo Ltd and contributors 2024

    This program is free software: you can redistribute it and/or modify it under the terms of the GNU Affero General Public License version 3 as published by the Free Software Foundation.

    This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Affero General Public License for more details.

    You should have received a copy of the GNU Affero General Public
    License along with this program.  If not, see <https://www.gnu.org/licenses/>.
*/

'use client';
import React from 'react';
import { CardDetails, Project } from '../lib/definitions';
import { Breadcrumbs, Link } from '@mui/joy';
import HomeIcon from '@mui/icons-material/Home';
import { findPathTo } from '../lib/utils';

type ProjectBreadcrumbsProps = {
  selectedCard: CardDetails | null;
  project: Project | null;
};

export const ProjectBreadcrumbs: React.FC<ProjectBreadcrumbsProps> = ({
  selectedCard,
  project,
}) => {
  if (selectedCard == null || project == null || project.cards == null)
    return <div></div>;

  const pathComponents = findPathTo(selectedCard.key, project.cards);
  if (pathComponents == null) return <div></div>;

  return (
    <Breadcrumbs>
      {pathComponents.map((node, index) => (
        <Link
          key={node.key}
          href={`/cards/${node.key}`}
          style={{ textDecoration: 'none', color: 'grey', fontSize: 14 }}
        >
          {index == 0 && <HomeIcon sx={{ mr: 0.7 }} fontSize="inherit" />}
          {node.metadata?.title ?? node.key}
        </Link>
      ))}
    </Breadcrumbs>
  );
};
