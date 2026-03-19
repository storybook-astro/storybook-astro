import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, describe, expect, test } from 'vitest';
import { resolveRulesConfigFilePath } from './rules-options.ts';

const createdDirs = new Set<string>();

afterEach(async () => {
  await Promise.all(
    Array.from(createdDirs).map(async (directory) => {
      await rm(directory, { recursive: true, force: true });
      createdDirs.delete(directory);
    })
  );
});

async function createTempDirectory() {
  const directory = await mkdtemp(join(tmpdir(), 'storybook-astro-story-rules-'));

  createdDirs.add(directory);

  return directory;
}

describe('resolveRulesConfigFilePath', () => {
  test('returns undefined when story rules are not configured', () => {
    expect(resolveRulesConfigFilePath(undefined)).toBeUndefined();
  });

  test('resolves a direct file path', async () => {
    const directory = await createTempDirectory();
    const configPath = join(directory, 'story-rules.ts');

    await writeFile(configPath, 'export default { rules: [] };', 'utf-8');

    expect(resolveRulesConfigFilePath('./story-rules.ts', directory)).toBe(configPath);
  });

  test('resolves extensionless config path', async () => {
    const directory = await createTempDirectory();
    const configPath = join(directory, 'story-rules.ts');

    await writeFile(configPath, 'export default { rules: [] };', 'utf-8');

    expect(resolveRulesConfigFilePath('./story-rules', directory)).toBe(configPath);
  });

  test('resolves directory config to index file', async () => {
    const directory = await createTempDirectory();
    const configDirectory = join(directory, 'story-rules');
    const configPath = join(configDirectory, 'index.ts');

    await mkdir(configDirectory, { recursive: true });
    await writeFile(configPath, 'export default { rules: [] };', 'utf-8');

    expect(resolveRulesConfigFilePath('./story-rules', directory)).toBe(configPath);
  });

  test('throws when the configured file does not exist', () => {
    expect(() => resolveRulesConfigFilePath('./missing-rules', '/tmp')).toThrow(
      'framework.options.storyRules config file was not found:'
    );
  });

  test('throws when config path is empty', () => {
    expect(() => resolveRulesConfigFilePath('   ')).toThrow(
      'framework.options.storyRules config file path cannot be empty.'
    );
  });
});
