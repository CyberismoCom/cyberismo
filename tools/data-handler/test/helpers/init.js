import { resolve } from 'path';
process.env.TS_NODE_PROJECT = resolve('test/tsconfig.json');
process.env.NODE_ENV = 'development';
