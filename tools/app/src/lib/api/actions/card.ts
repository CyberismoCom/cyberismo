/**
    Cyberismo
    Copyright © Cyberismo Ltd and contributors 2024

    This program is free software: you can redistribute it and/or modify it under the terms of the GNU Affero General Public License version 3 as published by the Free Software Foundation.

    This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Affero General Public License for more details.

    You should have received a copy of the GNU Affero General Public
    License along with this program.  If not, see <https://www.gnu.org/licenses/>.
*/

//import { evaluateMacros } from '@cyberismo/data-handler';
import { callApi } from '../../swr';

export async function parseContent(key: string, content: string) {
  const result = await callApi<{ parsedContent: string }>(
    `/api/cards/${key}/parse`,
    'POST',
    { content },
  );
  return result.parsedContent;
}
