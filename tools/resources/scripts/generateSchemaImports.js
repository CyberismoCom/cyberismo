import fs from 'node:fs';
import path from 'node:path';

const schemaDir = './src/schema';
const outputFilePath = './src/schemas.ts';
const parentSchemaFile = 'cardTreeDirectorySchema';

const license = `
/**
    Cyberismo
    Copyright © Cyberismo Ltd and contributors 2024

    This program is free software: you can redistribute it and/or modify it under the terms of the GNU Affero General Public License version 3 as published by the Free Software Foundation.

    This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Affero General Public License for more details.

    You should have received a copy of the GNU Affero General Public
    License along with this program.  If not, see <https://www.gnu.org/licenses/>.
*/

`;

const schemas = [];

function nameToCamelCase(name) {
  return name.replace(/-(\w)/g, (_, letter) => letter.toUpperCase());
}

function getImportPath(filePath) {
  return (
    './' +
    path.relative(path.dirname(outputFilePath), filePath).replace(/\\/g, '/')
  );
}

const parentSchemaTs = nameToCamelCase(parentSchemaFile);

function readSchemas(dir) {
  const files = fs.readdirSync(dir);

  files.forEach((file) => {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);
    const name = path.basename(file, '.json');

    if (stat.isDirectory()) {
      readSchemas(filePath);
    } else if (path.extname(file) === '.json') {
      // do not include parent schema file
      if (name === parentSchemaFile) {
        return;
      }
      // convert file path to relative path from output file
      schemas.push({
        path: getImportPath(filePath),
        name: nameToCamelCase(name),
      });
    }
  });
}

readSchemas(schemaDir);

// create output
// formatting doesn't matter, prettier will take care of it
let outputContent =
  license +
  schemas
    .map(({ path, name }) => {
      return `import ${name} from '${path.replace(/\\/g, '/')}' with {type: 'json'};`;
    })
    .join('\n');

// also import parent schema file
outputContent += `\nimport ${parentSchemaTs} from '${getImportPath(path.join(schemaDir, parentSchemaFile + `.json' with {type: 'json'};`))}\n`;

// create schemas array
outputContent += '\n\nexport const schemas = [\n';
outputContent += schemas.map(({ name }) => name).join(',');
outputContent += '];\n';

// export parent schema file
outputContent += `\nexport const parentSchema = ${parentSchemaTs};`;

fs.writeFileSync(outputFilePath, outputContent);

console.log('Schemas imported successfully!');
