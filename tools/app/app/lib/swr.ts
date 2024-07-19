/**
    Cyberismo
    Copyright © Cyberismo Ltd and contributors 2024

    This program is free software: you can redistribute it and/or modify it under the terms of the GNU Affero General Public License version 3 as published by the Free Software Foundation.

    This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Affero General Public License for more details.

    You should have received a copy of the GNU Affero General Public
    License along with this program.  If not, see <https://www.gnu.org/licenses/>.
*/

import { SWRConfiguration } from 'swr';

export class ApiCallError extends Error {
  public reason: string;
  constructor(
    public response: Response,
    reason?: string,
  ) {
    super(`Api call failed: ${response.status} ${response.statusText}`);
    this.reason = reason || 'unknown';
  }
}

export async function createApiCallError(
  response: Response,
): Promise<ApiCallError> {
  return new ApiCallError(
    response,
    response.headers.get('content-type') === 'text/plain'
      ? await response.text()
      : `Api call failed: ${response.status} ${response.statusText}`,
  );
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
  url: string,
  method: 'GET' | 'PUT' | 'POST' | 'DELETE' | 'PATCH',
  body?: any,
): Promise<T> {
  const options: RequestInit = {
    method,
  };

  if (body) {
    options.body = JSON.stringify(body);
    options.headers = {
      'Content-Type': 'application/json',
    };
  }

  return handleResponse(await fetch(url, options));
}

// default fetcher for swr
export const fetcher = async function (...args: Parameters<typeof fetch>) {
  return handleResponse(await fetch(...args));
};

// used to configure swr on a global level
export function getSwrConfig(): SWRConfiguration {
  return {
    fetcher,
  };
}

export const apiPaths = {
  project: () => '/api/cards',
  card: (key: string) => `/api/cards/${key}`,
  fieldTypes: () => '/api/fieldtypes',
  cardType: (key: string) => `/api/cardtypes/${key}`,
  templates: () => '/api/templates',
  attachment: (cardKey: string, attachment: string) =>
    `/api/cards/${cardKey}/a/${attachment}`,
};
