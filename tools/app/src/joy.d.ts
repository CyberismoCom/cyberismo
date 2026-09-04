/**
  Cyberismo
  Copyright © Cyberismo Ltd and contributors 2026
  This program is free software: you can redistribute it and/or modify it under
  the terms of the GNU Affero General Public License version 3 as published by
  the Free Software Foundation.
  This program is distributed in the hope that it will be useful, but WITHOUT
  ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS
  FOR A PARTICULAR PURPOSE. See the GNU Affero General Public License for more
  details. You should have received a copy of the GNU Affero General Public
  License along with this program. If not, see <https://www.gnu.org/licenses/>.
*/

// The design system adds one typography level beyond Joy's defaults: `label`,
// the brand's uppercase tracked eyebrow. Declared here so `level="label"`
// type-checks wherever it is used.
declare module '@mui/joy/styles/types/typography' {
  interface TypographySystemOverrides {
    label: true;
  }
}

export {};
