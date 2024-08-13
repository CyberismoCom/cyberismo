import cardBaseSchema from '../../../schema/card-base-schema.json';
import cardDirectorySchema from '../../../schema/card-directory-schema.json';
import cardsconfigSchema from '../../../schema/cardsconfig-schema.json';
import cardtypeSchema from '../../../schema/cardtype-schema.json';
import createCardsMacroSchema from '../../../schema/create-cards-macro-schema.json';
import csvSchema from '../../../schema/csv-schema.json';
import fieldTypeSchema from '../../../schema/field-type-schema.json';
import linkTypeSchema from '../../../schema/link-type-schema.json';
import templateSchema from '../../../schema/template-schema.json';
import workflowSchema from '../../../schema/workflow-schema.json';
import cardtreeDirectorySchema from '../../../schema/cardtree-directory-schema.json';

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
