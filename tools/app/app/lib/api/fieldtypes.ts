import { useSWRHook } from './common'
import { apiPaths } from '../swr'

import { SWRConfiguration } from 'swr'

export const useFieldTypes = (options?: SWRConfiguration) =>
  useSWRHook<'fieldTypes'>(apiPaths.fieldTypes(), 'fieldTypes', options)
