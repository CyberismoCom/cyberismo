/**
    Cyberismo
    Copyright © Cyberismo Ltd and contributors 2024

    This program is free software: you can redistribute it and/or modify it under the terms of the GNU Affero General Public License version 3 as published by the Free Software Foundation.

    This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Affero General Public License for more details.

    You should have received a copy of the GNU Affero General Public
    License along with this program.  If not, see <https://www.gnu.org/licenses/>.
*/

import { ReactCodeMirrorProps } from '@uiw/react-codemirror';

export const MAX_RECENTS_STORED = 20;

// These are resources that can be created from the toolbar
export const RESOURCES = [
  'calculations',
  'cardTypes',
  'fieldTypes',
  'graphModels',
  'graphViews',
  'linkTypes',
  'reports',
  'templates',
  'workflows',
] as const;

export type ResourceName = (typeof RESOURCES)[number];

// Data type values for field types
export const DATA_TYPES = [
  'shortText',
  'longText',
  'number',
  'integer',
  'boolean',
  'date',
  'dateTime',
  'enum',
  'list',
  'person',
] as const;

export const CODE_MIRROR_BASE_PROPS: ReactCodeMirrorProps = {
  basicSetup: {
    lineNumbers: false,
  },
  style: {
    border: '1px solid',
    borderColor: 'rgba(0,0,0,0.23)',
    borderRadius: 4,
  },
};
