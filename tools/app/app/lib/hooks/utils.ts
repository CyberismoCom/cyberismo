import { usePathname } from 'next/navigation'
import { errorEvent, successEvent } from '../actions'
import { useAppDispatch } from './redux'
import { useEffect, useMemo, useRef } from 'react'
import { findParentCard } from '../utils'
import { useProject } from '../api'

/**
 * Wrapper for error handling
 * Most requests send a success message on success and an error message on failure
 * @param name
 * @param fn
 * @returns
 */
export function useErrorWrapper<T, U extends any[]>(
  name: string,
  fn: (...args: U) => Promise<T | null>
): (successMsg: string, ...args: U) => Promise<T | null> {
  const dispatch = useAppDispatch()

  return async (successMsg: string, ...args: U) => {
    try {
      const res = await fn(...args)
      dispatch(
        successEvent({
          name,
          message: successMsg,
        })
      )
      return res
    } catch (error) {
      dispatch(
        errorEvent({
          name,
          message: error instanceof Error ? error.message : '',
        })
      )
    }
    return null
  }
}

export function useCardKey() {
  const pathName = usePathname()
  const urlParts = pathName.slice(1).split('/')
  return urlParts[0] == 'cards' ? urlParts[1] ?? null : null
}

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
    return () => {
      isMounted.current = false
    }
  }, [])
  return useMemo(() => isMounted.current, [isMounted])
}
