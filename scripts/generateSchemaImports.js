const fs = require('fs');
const path = require('path');

const schemaDir = './tools/schema';
const outputFilePath = './tools/data-handler/src/utils/schemas.ts';
const parentSchemaFile = 'cardtree-directory-schema';

const schemas = [];

function nameToCamelCase(name) {
  return name.replace(/-(\w)/g, (_, letter) => letter.toUpperCase());
}

function getImportPath(filePath) {
  return path
    .relative(path.dirname(outputFilePath), filePath)
    .replace(/\\/g, '/');
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
let outputContent = schemas
  .map(({ path, name }) => {
    return `import ${name} from '${path.replace(/\\/g, '/')}';`;
  })
  .join('\n');

// also import parent schema file
outputContent += `\nimport ${parentSchemaTs} from '${getImportPath(path.join(schemaDir, parentSchemaFile + '.json'))}';\n`;

/*
outputContent +=
  '\n\nconst schemas = [' +
  schemas.map(({ name }) => name).join(', ') +
  '];\nexport default schemas;\n';*/

// create schemas array
outputContent += '\n\nexport const schemas = [\n';
outputContent += schemas.map(({ name }) => name).join(',');
outputContent += '];\n';

// export parent schema file
outputContent += `\nexport const parentSchema = ${parentSchemaTs};`;

fs.writeFileSync(outputFilePath, outputContent);

console.log('Schemas imported successfully!');
