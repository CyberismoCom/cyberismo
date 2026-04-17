/**
    Cyberismo
    Copyright © Cyberismo Ltd and contributors 2024

    This program is free software: you can redistribute it and/or modify it under the terms of the GNU Affero General Public License version 3 as published by the Free Software Foundation.

    This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Affero General Public License for more details.

    You should have received a copy of the GNU Affero General Public
    License along with this program.  If not, see <https://www.gnu.org/licenses/>.
*/

import { callApi, projectApiPaths } from '../../swr';

export async function addAttachments(
  key: string,
  formData: FormData,
  projectPrefix?: string,
) {
  return callApi(
    projectApiPaths(projectPrefix).cardAttachments(key),
    'POST',
    formData,
  );
}

export async function removeAttachment(
  key: string,
  filename: string,
  projectPrefix?: string,
) {
  return callApi(
    projectApiPaths(projectPrefix).cardAttachment(key, filename),
    'DELETE',
  );
}

/**
 * Opens an attachment using the operating system's default application.
 * @param key
 * @param filename
 * @returns
 */
export async function openAttachment(
  key: string,
  filename: string,
  projectPrefix?: string,
) {
  return callApi(
    projectApiPaths(projectPrefix).cardAttachmentOpen(key, filename),
    'POST',
  );
}
