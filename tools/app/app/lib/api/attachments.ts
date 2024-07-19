/**
    Cyberismo
    Copyright © Cyberismo Ltd and contributors 2024

    This program is free software: you can redistribute it and/or modify it under the terms of the GNU Affero General Public License version 3 as published by the Free Software Foundation.

    This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Affero General Public License for more details.

    You should have received a copy of the GNU Affero General Public
    License along with this program.  If not, see <https://www.gnu.org/licenses/>.
*/

import { apiPaths } from '../swr';

import useSWR, { SWRConfiguration } from 'swr';
import { useCard } from './card';
import { Attachment } from '../definitions';

export const useAttachments = (
  key: string | null,
  options?: SWRConfiguration,
) => {
  const { card } = useCard(key, options);

  options = {
    ...options,
    fetcher: (args: string[]) => {
      return Promise.all(
        args.map((url) => {
          return fetch(url)
            .then((res) => res.blob())
            .then((data) => handleAttachment(url.split('/').pop() || '', data));
        }),
      );
    },
  };

  const swrData = useSWR<Attachment[]>(
    key != null && card
      ? card?.attachments?.map((a) => apiPaths.attachment(key, a.fileName))
      : null,
    options,
  );
  return {
    ...swrData,
    attachments: swrData.data?.filter((a) => a != null) || [],
  };
};

function handleAttachment(fileName: string, data: Blob) {
  if (data.type.startsWith('image')) {
    const image = URL.createObjectURL(data);
    return { type: 'image', fileName, data, image };
  }
  return { type: 'file', fileName, data };
}
