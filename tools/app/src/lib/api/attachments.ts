/**
    Cyberismo
    Copyright © Cyberismo Ltd and contributors 2024

    This program is free software: you can redistribute it and/or modify it under the terms of the GNU Affero General Public License version 3 as published by the Free Software Foundation.

    This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Affero General Public License for more details.

    You should have received a copy of the GNU Affero General Public
    License along with this program.  If not, see <https://www.gnu.org/licenses/>.
*/

import type { SWRConfiguration } from 'swr';
import { useCard } from './card';
import { useUpdating } from '../hooks';
import { addAttachments, removeAttachment } from './actions';
import { mutate } from 'swr';
import { apiPaths } from '../swr';
import type { AttachmentAction } from './action-types';

export const useAttachments = (
  key: string | null,
  options?: SWRConfiguration,
) => {
  const { card } = useCard(key, options);
  // NOTE: not an swrkey, but this pretends to be one
  const swrKey = key != null && card ? `${key}/a` : null;
  const { isUpdating, call } = useUpdating(swrKey);
  return {
    addAttachments: (files: File[]) =>
      key &&
      call(() => {
        const formData = new FormData();
        files.forEach((file) => formData.append('files', file));
        return addAttachments(key, formData).then(() =>
          mutate(apiPaths.card(key)),
        );
      }, 'add'),
    removeAttachment: (fileName: string) =>
      key &&
      call(
        () =>
          removeAttachment(key, fileName).then(() =>
            mutate(apiPaths.card(key)),
          ),
        'remove',
      ),
    isUpdating: (action?: AttachmentAction) => isUpdating(action),
  };
};
