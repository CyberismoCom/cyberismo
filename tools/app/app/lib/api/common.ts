import useSWR, { SWRConfiguration } from 'swr'

import { Resources, ResourceName, SwrResult } from './types'

export function useSWRHook<T extends ResourceName>(
  swrKey: string | null,
  name: T,
  options?: SWRConfiguration
) {
  const { data, ...rest } = useSWR<Resources[T]>(swrKey)
  return {
    ...rest,
    [name]: data || null,
  } as SwrResult<T>
}
