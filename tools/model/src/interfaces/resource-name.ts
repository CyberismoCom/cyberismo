/**
    Cyberismo
    Copyright © Cyberismo Ltd and contributors 2026

    This program is free software: you can redistribute it and/or modify it under the terms of the GNU Affero General Public License version 3 as published by the Free Software Foundation.

    This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Affero General Public License for more details.

    You should have received a copy of the GNU Affero General Public
    License along with this program.  If not, see <https://www.gnu.org/licenses/>.
*/

// Resource name parts are:
// - prefix; name of the project this resource is part of
// - type; type of resource; in plural
// - identifier; unique name (within a project/module) for the resource
export interface ResourceName {
  prefix: string;
  type: string; // todo: should be a ResourceFolderType
  identifier: string;
}
