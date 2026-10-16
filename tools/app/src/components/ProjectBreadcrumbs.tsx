// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

import React from 'react';
import { Breadcrumbs, Link, styled } from '@mui/joy';
import { Link as RouterLink } from 'react-router';
import HomeIcon from '@mui/icons-material/Home';
import { findPathTo } from '../lib/utils';
import type { QueryResult } from '@cyberismo/model';

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
            textDecorationColor: 'grey',
            color: 'grey',
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
