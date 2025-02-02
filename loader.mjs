import { register } from 'ts-node';
import { pathToFileURL } from 'url';

register({
  project: './tsconfig.server.json',
  experimentalSpecifierResolution: true
});

export function resolve(specifier, context, defaultResolve) {
  return defaultResolve(specifier, context, defaultResolve);
}

export function load(url, context, defaultLoad) {
  return defaultLoad(url, context, defaultLoad);
}
