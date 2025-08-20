import { useProject } from '@/lib/api/project';
import { Typography } from '@mui/joy';

export function Identifier({ prefix, type }: { prefix: string; type: string }) {
  return (
    <Typography
      sx={{
        color: 'text.tertiary',
        fontFamily: 'monospace',
        whiteSpace: 'nowrap',
      }}
    >
      {prefix} / {type} /
    </Typography>
  );
}

export default function ProjectIdentifier({ type }: { type: string }) {
  const { project } = useProject();
  return <Identifier prefix={project?.prefix || ''} type={type} />;
}
