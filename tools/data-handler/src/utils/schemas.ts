/**
    Cyberismo
    Copyright © Cyberismo Ltd and contributors 2024

    This program is free software: you can redistribute it and/or modify it under the terms of the GNU Affero General Public License version 3 as published by the Free Software Foundation.

    This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Affero General Public License for more details.

    You should have received a copy of the GNU Affero General Public
    License along with this program.  If not, see <https://www.gnu.org/licenses/>.
*/

import cardBaseSchema from '../../../schema/card-base-schema.json' with { type: 'json' };
import cardDirectorySchema from '../../../schema/card-directory-schema.json' with { type: 'json' };
import cardsconfigSchema from '../../../schema/cardsconfig-schema.json' with { type: 'json' };
import cardtypeSchema from '../../../schema/cardtype-schema.json' with { type: 'json' };
import createCardsMacroSchema from '../../../schema/create-cards-macro-schema.json' with { type: 'json' };
import csvSchema from '../../../schema/csv-schema.json' with { type: 'json' };
import fieldTypeSchema from '../../../schema/field-type-schema.json' with { type: 'json' };
import linkTypeSchema from '../../../schema/link-type-schema.json' with { type: 'json' };
import templateSchema from '../../../schema/template-schema.json' with { type: 'json' };
import workflowSchema from '../../../schema/workflow-schema.json' with { type: 'json' };
import cardtreeDirectorySchema from '../../../schema/cardtree-directory-schema.json' with { type: 'json' };

export const schemas = [
  cardBaseSchema,
  cardDirectorySchema,
  cardsconfigSchema,
  cardtypeSchema,
  createCardsMacroSchema,
  csvSchema,
  fieldTypeSchema,
  linkTypeSchema,
  templateSchema,
  workflowSchema,
];

export const parentSchema = cardtreeDirectorySchema;