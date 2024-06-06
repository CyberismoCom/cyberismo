import { SWRConfiguration } from 'swr'

export class ApiCallError extends Error {
  public reason: string
  constructor(
    public response: Response,
    reason?: string
  ) {
    super(`Api call failed: ${response.status} ${response.statusText}`)
    this.reason = reason || 'unknown'
  }
}

export async function createApiCallError(
  response: Response
): Promise<ApiCallError> {
  return new ApiCallError(
    response,
    response.headers.get('content-type') === 'text/plain'
      ? await response.text()
      : `Api call failed: ${response.status} ${response.statusText}`
  )
}

async function handleResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    throw await createApiCallError(response)
  }
  return response.json()
}

// used to call api with fetch
export async function callApi<T>(
  url: string,
  method: 'GET' | 'PUT' | 'POST' | 'DELETE' | 'PATCH',
  body: any | undefined
): Promise<T> {
  const options: RequestInit = {
    method,
  }

  if (body) {
    options.body = JSON.stringify(body)
    options.headers = {
      'Content-Type': 'application/json',
    }
  }

  return handleResponse(await fetch(url, options))
}

// default fetcher for swr
const fetcher = async function (...args: Parameters<typeof fetch>) {
  return handleResponse(await fetch(...args))
}

// used to configure swr on a global level
export function getSwrConfig(): SWRConfiguration {
  return {
    fetcher,
  }
}

export const apiPaths = {
  project: () => '/api/cards',
  card: (key: string) => `/api/cards/${key}`,
  fieldTypes: () => '/api/fieldtypes',
}
