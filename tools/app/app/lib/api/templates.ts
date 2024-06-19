import { useSWRHook } from './common'
import { apiPaths } from '../swr'

import { SWRConfiguration } from 'swr'

export const useTemplates = (options?: SWRConfiguration) =>
  useSWRHook<'templates'>(apiPaths.templates(), 'templates', options)
