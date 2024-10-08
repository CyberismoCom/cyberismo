/**
    Cyberismo
    Copyright © Cyberismo Ltd and contributors 2024

    This program is free software: you can redistribute it and/or modify it under the terms of the GNU Affero General Public License version 3 as published by the Free Software Foundation.

    This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Affero General Public License for more details.

    You should have received a copy of the GNU Affero General Public
    License along with this program.  If not, see <https://www.gnu.org/licenses/>.
*/

import cardBaseSchema from '../../../schema/cardBaseSchema.json' with { type: 'json' };
import cardTypeSchema from '../../../schema/cardTypeSchema.json' with { type: 'json' };
import cardsConfigSchema from '../../../schema/cardsConfigSchema.json' with { type: 'json' };
import createCardsMacroSchema from '../../../schema/createCardsMacroSchema.json' with { type: 'json' };
import csvSchema from '../../../schema/csvSchema.json' with { type: 'json' };
import fieldTypeSchema from '../../../schema/fieldTypeSchema.json' with { type: 'json' };
import linkTypeSchema from '../../../schema/linkTypeSchema.json' with { type: 'json' };
import reportMacroDefaultSchema from '../../../schema/reportMacroDefaultSchema.json' with { type: 'json' };
import reportSchema from '../../../schema/reportSchema.json' with { type: 'json' };
import templateSchema from '../../../schema/templateSchema.json' with { type: 'json' };
import workflowSchema from '../../../schema/workflowSchema.json' with { type: 'json' };
import cardTreeDirectorySchema from '../../../schema/cardTreeDirectorySchema.json' with { type: 'json' };

export const schemas = [
  cardBaseSchema,
  cardTypeSchema,
  cardsConfigSchema,
  createCardsMacroSchema,
  csvSchema,
  fieldTypeSchema,
  linkTypeSchema,
  reportMacroDefaultSchema,
  reportSchema,
  templateSchema,
  workflowSchema,
];

export const parentSchema = cardTreeDirectorySchema;
