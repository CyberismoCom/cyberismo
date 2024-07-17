/**
    Cyberismo
    Copyright © Cyberismo Ltd and contributors 2024

    This program is free software: you can redistribute it and/or modify it under the terms of the GNU Affero General Public License version 3 as published by the Free Software Foundation.

    This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Affero General Public License for more details.

    You should have received a copy of the GNU Affero General Public
    License along with this program.  If not, see <https://www.gnu.org/licenses/>.
*/

enum httpStatusCode {
  Info = 100,
  OK = 200,
  BAD = 400,
  SERVER_ERROR = 500,
}
export interface requestStatus {
  statusCode: httpStatusCode;
  message?: string;
  payload?: object | attachmentPayload;
}

// todo: this should be someplace else
export interface attachmentPayload {
  fileBuffer: Buffer;
  mimeType: string;
}
