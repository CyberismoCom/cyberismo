// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

import type { SWRConfiguration } from 'swr';
import { useCardSource } from './card';
import { useUpdating } from '../hooks';
import { addAttachments, removeAttachment } from './actions';
import { mutate } from 'swr';
import { projectApiPaths } from '../swr';
import type { AttachmentAction } from './action-types';

export const useAttachments = (
  key: string | null,
  options?: SWRConfiguration,
  projectPrefix?: string,
) => {
  const { cardSource } = useCardSource(key, options, projectPrefix);
  const apiPaths = projectApiPaths(projectPrefix);
  // NOTE: not an swrkey, but this pretends to be one
  const swrKey = key != null && cardSource ? `${key}/a` : null;
  const { isUpdating, call } = useUpdating(swrKey);
  return {
    addAttachments: (files: File[]) =>
      key &&
      call(() => {
        const formData = new FormData();
        files.forEach((file) => formData.append('files', file));
        return addAttachments(key, formData, projectPrefix).then(() => {
          mutate(apiPaths.cardSource(key));
          mutate(apiPaths.cardContent(key));
        });
      }, 'add'),
    removeAttachment: (fileName: string) =>
      key &&
      call(
        () =>
          removeAttachment(key, fileName, projectPrefix).then(() => {
            mutate(apiPaths.cardSource(key));
            mutate(apiPaths.cardContent(key));
          }),
        'remove',
      ),
    isUpdating: (action?: AttachmentAction) => isUpdating(action),
  };
};
