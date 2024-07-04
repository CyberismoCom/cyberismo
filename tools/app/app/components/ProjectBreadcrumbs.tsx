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
          {node.metadata?.summary ?? node.key}
        </Link>
      ))}
    </Breadcrumbs>
  );
};
