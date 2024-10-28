import asciidoctor from 'asciidoctor';

const key = '__cyberimo__asciidoctor__instance';

const globalObj: any = globalThis;

if (typeof globalObj[key] == 'undefined') {
  globalObj[key] = asciidoctor();
}

export default globalObj[key];
