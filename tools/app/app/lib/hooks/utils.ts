import { useCallback, useEffect, useMemo, useRef } from 'react'
import { findParentCard } from '../utils'
import { useProject } from '../api'

export function useParentCard(key: string | null) {
  const { project } = useProject()
  return useMemo(
    () => (key && project?.cards ? findParentCard(project.cards, key) : null),
    [project, key]
  )
}

export function useIsMounted() {
  const isMounted = useRef(true)
  useEffect(() => {
    isMounted.current = true
    return () => {
      isMounted.current = false
    }
  }, [])
  return useCallback(() => isMounted.current, [])
}
