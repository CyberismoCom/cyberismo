/**
    Cyberismo
    Copyright © Cyberismo Ltd and contributors 2024

    This program is free software: you can redistribute it and/or modify it under the terms of the GNU Affero General Public License version 3 as published by the Free Software Foundation.

    This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Affero General Public License for more details.

    You should have received a copy of the GNU Affero General Public
    License along with this program.  If not, see <https://www.gnu.org/licenses/>.
*/

import type { SWRConfiguration } from 'swr';
import { getConfig } from './utils';
import { store } from './store';
import { setSessionExpired } from './slices/session';

/**
 * Resolves the project prefix from the URL if not explicitly provided.
 */
function resolveProjectPrefix(projectPrefix?: string): string {
  if (projectPrefix) return projectPrefix;
  const match = window.location.pathname.match(/\/projects\/([^/]+)/);
  if (!match) throw new Error('No project prefix found in URL');
  return decodeURIComponent(match[1]);
}

/** Global API paths that are not project-scoped. */
export const globalApiPaths = {
  projects: () => '/api/projects',
  user: () => '/api/auth/me',
};

/**
 * Returns project-scoped API paths for the given project.
 * If `projectPrefix` is omitted, it is resolved from `window.location.pathname`.
 */
export function projectApiPaths(projectPrefix?: string) {
  const base = `/api/projects/${encodeURIComponent(resolveProjectPrefix(projectPrefix))}`;
  return {
    cards: () => `${base}/cards`,
    card: (key: string) => `${base}/cards/${key}`,
    rawCard: (key: string) => `${base}/cards/${key}?raw=true`,
    calculations: () => `${base}/calculations`,
    calculation: (name: string) => `${base}/calculations/${name}`,
    cardTypes: () => `${base}/cardTypes`,
    cardTypeFieldVisibility: (cardTypeName: string) =>
      `${base}/cardTypes/${encodeURIComponent(cardTypeName)}/field-visibility`,
    connectors: () => `${base}/connectors`,
    fieldTypes: () => `${base}/fieldTypes`,
    graphModels: () => `${base}/graphModels`,
    graphViews: () => `${base}/graphViews`,
    logicPrograms: (resourceName: string) =>
      `${base}/logicPrograms/${resourceName}`,
    cardType: (cardType: string) => `${base}/cardTypes?name=${cardType}`,
    templates: () => `${base}/templates`,
    templateCard: () => `${base}/templates/card`,
    templateTree: () => `${base}/templates/tree`,
    attachment: (cardKey: string, attachment: string) =>
      `${base}/cards/${cardKey}/a/${encodeURIComponent(attachment)}`,
    cardAttachments: (cardKey: string) =>
      `${base}/cards/${cardKey}/attachments`,
    cardAttachment: (cardKey: string, filename: string) =>
      `${base}/cards/${cardKey}/attachments/${encodeURIComponent(filename)}`,
    cardAttachmentOpen: (cardKey: string, filename: string) =>
      `${base}/cards/${cardKey}/attachments/${encodeURIComponent(filename)}/open`,
    cardLinks: (cardKey: string) => `${base}/cards/${cardKey}/links`,
    cardParse: (cardKey: string) => `${base}/cards/${cardKey}/parse`,
    linkTypes: () => `${base}/linkTypes`,
    reports: () => `${base}/reports`,
    workflows: () => `${base}/workflows`,
    resources: (type: string) => `${base}/resources/${type}`,
    resourceTree: () => `${base}/resources/tree`,
    resource: (resourceName: string) => `${base}/resources/${resourceName}`,
    resourceOperation: (resourceName: string) =>
      `${base}/resources/${resourceName}/operation`,
    tree: () => `${base}/tree`,
    labels: () => `${base}/labels`,
    validateResource: (resourceName: string) =>
      `${base}/resources/${resourceName}/validate`,
    project: () => `${base}/project`,
    projectModulesUpdate: () => `${base}/project/modules/update`,
    projectModuleUpdate: (module: string) =>
      `${base}/project/modules/${encodeURIComponent(module)}/update`,
    projectModuleDelete: (module: string) =>
      `${base}/project/modules/${encodeURIComponent(module)}`,
    projectModulesAdd: () => `${base}/project/modules`,
    projectModulesImportable: () => `${base}/project/modules/importable`,
    presence: (cardKey: string, mode: string) =>
      `${base}/cards/${encodeURIComponent(cardKey)}/presence?mode=${mode}`,
  };
}

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
    if (response.status === 401) {
      store.dispatch(setSessionExpired());
      // Block further processing so components stay in loading state
      // instead of showing error screens
      return new Promise<T>(() => {});
    }
    throw await createApiCallError(response);
  }
  if (response.status === 204) return null as unknown as T; // no content, return null
  return response.json();
}

// used to call api with fetch
export async function callApi<T>(
  url: string,
  method: 'GET' | 'PUT' | 'POST' | 'DELETE' | 'PATCH',
  // Below is disabled as JSON stringify also accepts any
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  body?: any,
): Promise<T> {
  if (getConfig().staticMode && method !== 'GET') {
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
    await fetch(`${url}${getConfig().staticMode ? '.json' : ''}`, options),
  );
}

// default fetcher for swr
export const fetcher = async function (...args: Parameters<typeof fetch>) {
  return handleResponse(await fetch(...args));
};

// used to configure swr on a global level
export function getSwrConfig(): SWRConfiguration {
  return {
    fetcher: getConfig().staticMode
      ? async function (...args: Parameters<typeof fetch>) {
          if (typeof args[0] === 'string') {
            args[0] = `${args[0]}.json`;
          }
          return fetcher(...args);
        }
      : fetcher,
  };
}
