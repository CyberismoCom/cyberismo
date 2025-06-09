/**
    Cyberismo
    Copyright © Cyberismo Ltd and contributors 2024

    This program is free software: you can redistribute it and/or modify it under the terms of the GNU Affero General Public License version 3 as published by the Free Software Foundation.

    This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Affero General Public License for more details.

    You should have received a copy of the GNU Affero General Public
    License along with this program.  If not, see <https://www.gnu.org/licenses/>.
*/

import { AppConfig } from '@/providers/ConfigContext';
import { SWRConfiguration } from 'swr';

export class ApiCallError extends Error {
  public reason: string;
  constructor(
    public response: Response,
    reason?: string,
  ) {
    super(
      reason ?? `Api call failed: ${response.status} ${response.statusText}`,
    );
    this.reason = reason || 'unknown';
  }
}

export async function createApiCallError(
  response: Response,
): Promise<ApiCallError> {
  // If the response is a text, return the text as the reason
  // Otherwise, it should be in json format, where the reason is the 'error' field
  const text = await response.text();
  try {
    const json = JSON.parse(text);
    return new ApiCallError(response, json.error);
  } catch {
    return new ApiCallError(response, text);
  }
}

async function handleResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    throw await createApiCallError(response);
  }
  if (response.status === 204) return null as unknown as T; // no content, return null
  return response.json();
}

// used to call api with fetch
export async function callApi<T>(
  config: AppConfig,
  url: string,
  method: 'GET' | 'PUT' | 'POST' | 'DELETE' | 'PATCH',
  // Below is disabled as JSON stringify also accepts any
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  body?: any,
): Promise<T> {
  if (config.staticMode && method !== 'GET') {
    throw new Error('Export mode is enabled, only GET requests are allowed');
  }
  const options: RequestInit = {
    method,
  };

  if (body) {
    // if body is file, don't stringify it
    if (body instanceof FormData) {
      options.body = body;
    } else {
      options.body = JSON.stringify(body);
      options.headers = {
        'Content-Type': 'application/json',
      };
    }
  }

  return handleResponse(
    await fetch(`${url}${config.staticMode ? '.json' : ''}`, options),
  );
}

// default fetcher for swr
export const fetcher = async function (...args: Parameters<typeof fetch>) {
  return handleResponse(await fetch(...args));
};

// used to configure swr on a global level
export function getSwrConfig(config: AppConfig): SWRConfiguration {
  return {
    fetcher: config.staticMode
      ? async function (...args: Parameters<typeof fetch>) {
          if (typeof args[0] === 'string') {
            args[0] = `${args[0]}.json`;
          }
          return fetcher(...args);
        }
      : fetcher,
  };
}

export const apiPaths = {
  project: () => '/api/cards',
  card: (key: string) => `/api/cards/${key}`,
  fieldTypes: () => '/api/fieldTypes',
  cardType: (cardType: string) => `/api/cardTypes?name=${cardType}`,
  templates: () => '/api/templates',
  attachment: (cardKey: string, attachment: string) =>
    `/api/cards/${cardKey}/a/${attachment}`,
  linkTypes: () => '/api/linkTypes',
  tree: () => '/api/tree',
};
