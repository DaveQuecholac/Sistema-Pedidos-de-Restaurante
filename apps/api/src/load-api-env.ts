import { existsSync, readFileSync } from 'node:fs';

/** Fills missing keys from apps/api/.env. Values already in the process win. */
export function loadApiEnv(path: string): void {
  if (!existsSync(path)) {
    return;
  }

  for (const rawLine of readFileSync(path, 'utf8').split('\n')) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) {
      continue;
    }

    const separator = line.indexOf('=');
    if (separator === -1) {
      continue;
    }

    let key = line.slice(0, separator).trim();
    if (key.startsWith('export ')) {
      key = key.slice('export '.length).trim();
    }
    if (!key || process.env[key] !== undefined) {
      continue;
    }

    process.env[key] = unquoteEnvValue(line.slice(separator + 1).trim());
  }
}

function unquoteEnvValue(value: string): string {
  if (value.length >= 2) {
    const quote = value[0];
    if ((quote === '"' || quote === "'") && value.endsWith(quote)) {
      return value.slice(1, -1);
    }
  }
  return value;
}
