import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import ts from 'typescript';
const cache = new Map();
export function moduleUrl(path) {
  path = resolve(path);
  if (cache.has(path)) return cache.get(path);
  let source = path.endsWith('.json') ? `export default ${readFileSync(path,'utf8')}` : ts.transpileModule(readFileSync(path,'utf8'), {compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
  source = source.replace(/(['"])(\.\.?\/[^'"]+\.(?:ts|json))\1(?:\s+with\s*\{\s*type:\s*['"]json['"]\s*\})?/g, (_,q,file) => JSON.stringify(moduleUrl(resolve(dirname(path),file))));
  const url = 'data:text/javascript;base64,'+Buffer.from(source).toString('base64');
  cache.set(path,url); return url;
}
export const game = await import(moduleUrl('supabase/functions/_shared/kingdom.ts'));
