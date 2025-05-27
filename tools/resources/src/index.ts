export * from './schemas.js';

// Manually import each resource
// They rarely change and we get 100% type safety this way
import commonBase from './calculations/common/base.lp';
import commonQueryLanguage from './calculations/common/queryLanguage.lp';
import queriesCard from './calculations/queries/card.lp';
import queriesOnCreation from './calculations/queries/onCreation.lp';
import queriesOnTransition from './calculations/queries/onTransition.lp';
import queriesTree from './calculations/queries/tree.lp';
import testModel from './calculations/test/model.lp';

import graphvizReportQuery from './graphvizReport/query.lp.hbs';
import graphvizReportIndex from './graphvizReport/index.adoc.hbs';

export const graphvizReport = {
  query: graphvizReportQuery,
  content: graphvizReportIndex,
};

export const lpFiles = {
  common: {
    base: commonBase,
    queryLanguage: commonQueryLanguage,
  },
  queries: {
    card: queriesCard,
    onCreation: queriesOnCreation,
    onTransition: queriesOnTransition,
    tree: queriesTree,
  },
  test: {
    model: testModel,
  },
};

// Helper function to get the absolute path to the static directory
export async function getStaticDirectoryPath(): Promise<string> {
  // Return early if not running in Node.js
  if (typeof process === 'undefined' || !process.versions?.node) {
    throw new Error(
      '@cyberismocom/resources: getStaticDirectoryPath can only be called in Node.js',
    );
  }
  const { join } = await import('node:path');

  // Get the directory of the current module
  const currentModuleDir = import.meta.dirname;

  // Look for static directory in the package
  return join(currentModuleDir, 'static');
}
