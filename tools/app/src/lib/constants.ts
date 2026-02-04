/**
    Cyberismo
    Copyright © Cyberismo Ltd and contributors 2024

    This program is free software: you can redistribute it and/or modify it under the terms of the GNU Affero General Public License version 3 as published by the Free Software Foundation.

    This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Affero General Public License for more details.

    You should have received a copy of the GNU Affero General Public
    License along with this program.  If not, see <https://www.gnu.org/licenses/>.
*/

import type { ReactCodeMirrorProps } from '@uiw/react-codemirror';
import { vscodeDark } from '@uiw/codemirror-theme-vscode';
import { githubLight } from '@uiw/codemirror-theme-github';
import type { TextareaProps } from '@mui/joy';

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

// Used to split labels when adding multiple labels at once
export const LABEL_SPLITTER = ';';

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

export const CODE_MIRROR_CONFIG_PROPS: ReactCodeMirrorProps = Object.assign(
  {},
  CODE_MIRROR_BASE_PROPS,
  {
    basicSetup: {
      lineNumbers: true,
    },
  },
);

export const CODE_MIRROR_THEMES = {
  light: githubLight,
  dark: vscodeDark,
};

// Default styling configuration for title input fields
export const TITLE_FIELD_PROPS: Pick<TextareaProps, 'sx'> = {
  sx: {
    marginBottom: '10px',
    fontWeight: 'bold',
    fontSize: '1.8rem',
  },
};

// Special fromState values for workflow transitions
export const ANY_STATE = '*'; // Wildcard for any state
export const NEW_CARD = ''; // Empty string represents new card

// Max width for form fields in config editors
export const FORM_FIELD_MAX_WIDTH = 720;
