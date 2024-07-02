import { useMemo } from 'react'
import { findParentCard } from '../utils'
import { useProject } from '../api'

export function useParentCard(key: string | null) {
  const { project } = useProject()
  return useMemo(
    () => (key && project?.cards ? findParentCard(project.cards, key) : null),
    [project, key]
  )
}
