import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { loadApiEnv } from './load-api-env';

const keys = ['CTTM_DATABASE_URL', 'CTTM_QUOTED', 'CTTM_EXPORTED', 'CTTM_EXISTING'] as const;

describe('loadApiEnv', () => {
  afterEach(() => {
    for (const key of keys) {
      delete process.env[key];
    }
  });

  it('reads export and quotes and keeps values already set', () => {
    const file = join(mkdtempSync(join(tmpdir(), 'api-env-')), '.env');
    writeFileSync(
      file,
      [
        '# comment',
        'export CTTM_EXPORTED="from-export"',
        "CTTM_QUOTED='plain'",
        'CTTM_DATABASE_URL=postgresql://postgres:postgres@localhost:5432/restaurante',
        'CTTM_EXISTING=from-file',
      ].join('\n'),
    );
    process.env.CTTM_EXISTING = 'from-process';

    loadApiEnv(file);

    expect(process.env.CTTM_EXPORTED).toBe('from-export');
    expect(process.env.CTTM_QUOTED).toBe('plain');
    expect(process.env.CTTM_DATABASE_URL).toBe(
      'postgresql://postgres:postgres@localhost:5432/restaurante',
    );
    expect(process.env.CTTM_EXISTING).toBe('from-process');
  });
});
