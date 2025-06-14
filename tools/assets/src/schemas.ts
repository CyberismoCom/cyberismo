/**
  Cyberismo
  Copyright © Cyberismo Ltd and contributors 2025
  This program is free software: you can redistribute it and/or modify it under
  the terms of the GNU Affero General Public License version 3 as published by
  the Free Software Foundation.
  This program is distributed in the hope that it will be useful, but WITHOUT
  ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS
  FOR A PARTICULAR PURPOSE. See the GNU Affero General Public License for more
  details. You should have received a copy of the GNU Affero General Public
  License along with this program. If not, see <https://www.gnu.org/licenses/>.
*/

/* THIS IS AN AUTOGENERATED FILE, DO NOT EDIT IT MANUALLY */
import cardBaseSchema from './schema/cardBaseSchema.json' with { type: 'json' };
import cardsConfigSchema from './schema/cardsConfigSchema.json' with { type: 'json' };
import cardTypeSchema from './schema/resources/cardTypeSchema.json' with { type: 'json' };
import createCardsMacroSchema from './schema/macros/createCardsMacroSchema.json' with { type: 'json' };
import csvSchema from './schema/csvSchema.json' with { type: 'json' };
import dotSchema from './schema/dotSchema.json' with { type: 'json' };
import fieldTypeSchema from './schema/resources/fieldTypeSchema.json' with { type: 'json' };
import graphMacroBaseSchema from './schema/macros/graphMacroBaseSchema.json' with { type: 'json' };
import graphModelSchema from './schema/resources/graphModelSchema.json' with { type: 'json' };
import graphViewSchema from './schema/resources/graphViewSchema.json' with { type: 'json' };
import linkTypeSchema from './schema/resources/linkTypeSchema.json' with { type: 'json' };
import reportMacroBaseSchema from './schema/macros/reportMacroBaseSchema.json' with { type: 'json' };
import reportSchema from './schema/resources/reportSchema.json' with { type: 'json' };
import schema from './schema/schema.json' with { type: 'json' };
import scoreCardMacroSchema from './schema/macros/scoreCardMacroSchema.json' with { type: 'json' };
import templateSchema from './schema/resources/templateSchema.json' with { type: 'json' };
import workflowSchema from './schema/resources/workflowSchema.json' with { type: 'json' };
import cardTreeDirectorySchema from './schema/cardTreeDirectorySchema.json' with { type: 'json' };

export const schemas = [
  cardBaseSchema,
  cardsConfigSchema,
  cardTypeSchema,
  createCardsMacroSchema,
  csvSchema,
  dotSchema,
  fieldTypeSchema,
  graphMacroBaseSchema,
  graphModelSchema,
  graphViewSchema,
  linkTypeSchema,
  reportMacroBaseSchema,
  reportSchema,
  schema,
  scoreCardMacroSchema,
  templateSchema,
  workflowSchema,
];

export const parentSchema = cardTreeDirectorySchema;
