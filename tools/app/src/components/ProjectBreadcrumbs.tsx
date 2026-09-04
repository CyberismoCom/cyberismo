/**
    Cyberismo
    Copyright © Cyberismo Ltd and contributors 2024

    This program is free software: you can redistribute it and/or modify it under the terms of the GNU Affero General Public License version 3 as published by the Free Software Foundation.

    This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Affero General Public License for more details.

    You should have received a copy of the GNU Affero General Public
    License along with this program.  If not, see <https://www.gnu.org/licenses/>.
*/

import React from 'react';
import { Breadcrumbs, Link, styled } from '@mui/joy';
import { Link as RouterLink } from 'react-router';
import HomeIcon from '@mui/icons-material/Home';
import { findPathTo } from '../lib/utils';
import type { QueryResult } from '@cyberismo/data-handler/types/queries';

type ProjectBreadcrumbsProps = {
  cardKey: string;
  tree: QueryResult<'tree'>[] | null;
};

const StyledBreadcrumbs = styled(Breadcrumbs)`
  .MuiBreadcrumbs-ol {
    line-height: 90%;
  }
`;

export const ProjectBreadcrumbs: React.FC<ProjectBreadcrumbsProps> = ({
  cardKey,
  tree,
}) => {
  if (tree == null) return <div></div>;

  const pathComponents = findPathTo(cardKey, tree);
  if (pathComponents == null) return <div></div>;

  return (
    <StyledBreadcrumbs className="breadcrumbs">
      {pathComponents.map((node, index) => (
        <Link
          key={node.key}
          component={RouterLink}
          to={`/cards/${node.key}`}
          style={{
            // Was the CSS keyword `grey`, which bypassed the palette entirely
            // and failed AA in light mode. Breadcrumbs are navigation, so they
            // take the secondary text token in both schemes.
            textDecorationColor: 'var(--joy-palette-text-tertiary)',
            color: 'var(--joy-palette-text-secondary)',
            fontSize: 14,
            marginTop: 1,
            marginBottom: 1,
          }}
        >
          {index === 0 && <HomeIcon sx={{ mr: 0.7 }} fontSize="inherit" />}
          {index === pathComponents.length - 1 && node.title
            ? `${node.title} - ${node.key}`
            : (node.title ?? node.key)}
        </Link>
      ))}
    </StyledBreadcrumbs>
  );
};
