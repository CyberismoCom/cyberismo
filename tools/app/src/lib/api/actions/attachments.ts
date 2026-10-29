// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

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
