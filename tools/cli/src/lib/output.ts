/**
  Cyberismo
  Copyright © Cyberismo Ltd and contributors 2024
  This program is free software: you can redistribute it and/or modify it under
  the terms of the GNU Affero General Public License version 3 as published by
  the Free Software Foundation.
  This program is distributed in the hope that it will be useful, but WITHOUT
  ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS
  FOR A PARTICULAR PURPOSE. See the GNU Affero General Public License for more
  details. You should have received a copy of the GNU Affero General Public
  License along with this program. If not, see <https://www.gnu.org/licenses/>.
*/

import type { requestStatus } from '@cyberismo/data-handler';

import { program } from './dispatch.js';

// Notifies on stderr that a deprecated command spelling was used.
export function deprecationNote(oldName: string, newName: string) {
  console.error(
    `Warning: 'cyberismo ${oldName}' is deprecated. Use 'cyberismo ${newName}' instead.`,
  );
}

// Handle the response object from data-handler
export function handleResponse(response: requestStatus) {
  if (response.statusCode === 200) {
    if (response.payload) {
      if (response.message) {
        console.log(response.message);
      }
      console.log(JSON.stringify(response.payload, null, 2));
    } else if (response.message) {
      console.log(response.message);
    } else {
      console.log('Done');
    }
    if (response.note) {
      console.log(`\n${response.note}`);
    }
  } else {
    if (response.message) {
      program.error(response.message);
    }
  }
}
