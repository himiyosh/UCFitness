import { readFile, readdir, stat } from 'node:fs/promises';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const AGENT_PATH = fileURLToPath(
  new URL('../.github/agents/UCFitnessAgent.agent.md', import.meta.url),
);
const HALLMARK_SKILL_PATH = fileURLToPath(
  new URL('../.github/skills/hallmark/SKILL.md', import.meta.url),
);
const HALLMARK_ROOT = fileURLToPath(
  new URL('../.github/skills/hallmark/', import.meta.url),
);
const HALLMARK_LICENSE_PATH = fileURLToPath(
  new URL('../.github/skills/hallmark/LICENSE', import.meta.url),
);
const HALLMARK_UPSTREAM_PATH = fileURLToPath(
  new URL('../.github/skills/hallmark/UPSTREAM.md', import.meta.url),
);
const README_PATH = fileURLToPath(new URL('../README.md', import.meta.url));
const PACKAGE_PATH = fileURLToPath(new URL('../package.json', import.meta.url));
const NEXT_AGENT_PATH = fileURLToPath(
  new URL('../.github/agents/expert-nextjs-developer.agent.md', import.meta.url),
);
const NEXT_REFERENCE_PATH = fileURLToPath(
  new URL('../.github/instructions/awesome-copilot/nextjs.instructions.md', import.meta.url),
);
const MAX_PROMPT_CHARACTERS = 30_000;
const MAX_PROFILE_BYTES = 24_000;
const REQUIRED_PROMPT_REFERENCES = [
  '.github/copilot-instructions.md',
  '.github/instructions/',
  '.github/skills/',
  '.agents/skills/',
  '.github/ucfitness-progress.json',
  '.github/skills/hallmark/SKILL.md',
  '.github/skills/self-critique-gate/SKILL.md',
  'npm run check:agents',
  'npm run check:rules',
];
const REQUIRED_HALLMARK_REFERENCES = [
  'references/contract.md',
  'references/study.md',
  'references/verbs/audit.md',
  'references/verbs/redesign.md',
];
const REQUIRED_HALLMARK_MODES = ['default', 'audit', 'redesign', 'study'];
const HALLMARK_VERSION = '1.1.0';
const HALLMARK_COMMIT = 'aeb42fb354ff4efa36ab475773a082315a3af2ce';

function fail(message) {
  console.error(`NG: ${message}`);
  process.exitCode = 1;
}

function parseScalar(value) {
  const trimmed = value.trim();

  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }

  if (trimmed === 'true') return true;
  if (trimmed === 'false') return false;
  return trimmed;
}

function parseAgent(source) {
  if (!source.startsWith('---\n')) {
    throw new Error('YAML frontmatter must start with an opening --- delimiter');
  }

  const closingDelimiter = source.indexOf('\n---\n', 4);
  if (closingDelimiter === -1) {
    throw new Error('YAML frontmatter must end with a closing --- delimiter');
  }

  const frontmatterSource = source.slice(4, closingDelimiter);
  const prompt = source.slice(closingDelimiter + '\n---\n'.length);
  const frontmatter = {};

  for (const [index, line] of frontmatterSource.split('\n').entries()) {
    if (line.trim() === '' || line.trimStart().startsWith('#')) continue;

    const match = line.match(/^([A-Za-z][A-Za-z0-9-]*):\s*(.+)$/);
    if (!match) {
      throw new Error(`Unsupported frontmatter syntax on line ${index + 2}`);
    }

    frontmatter[match[1]] = parseScalar(match[2]);
  }

  return { frontmatter, prompt };
}

async function pathExists(path) {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

async function collectMarkdownFiles(directory) {
  const files = [];

  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = `${directory}/${entry.name}`;

    if (entry.isDirectory()) {
      files.push(...(await collectMarkdownFiles(path)));
    } else if (entry.isFile() && entry.name.endsWith('.md')) {
      files.push(path);
    }
  }

  return files;
}

async function validateLocalMarkdownLinks(files) {
  let checkedLinks = 0;
  let upstreamOnlyLinks = 0;

  for (const file of files) {
    const source = await readFile(file, 'utf8');
    const links = source.matchAll(/\[[^\]]*]\(([^)]+)\)/g);

    for (const match of links) {
      const target = match[1].trim().replace(/^<|>$/g, '');

      if (
        target === '' ||
        target.startsWith('#') ||
        /^[a-z][a-z0-9+.-]*:/i.test(target)
      ) {
        continue;
      }

      const relativePath = decodeURIComponent(target.split('#', 1)[0]);
      const resolved = resolve(dirname(file), relativePath);
      const pathFromHallmarkRoot = relative(HALLMARK_ROOT, resolved);
      checkedLinks += 1;

      if (pathFromHallmarkRoot.startsWith('..')) {
        const upstreamPath = target.replace(/^(\.\.\/)+/, '');

        if (!/^(docs|site)\//.test(upstreamPath)) {
          fail(`unexpected external Hallmark reference in ${file}: ${target}`);
        }

        upstreamOnlyLinks += 1;
        continue;
      }

      if (!(await pathExists(resolved))) {
        fail(`broken Hallmark reference in ${file}: ${target}`);
      }
    }
  }

  return { checkedLinks, upstreamOnlyLinks };
}

let source;

try {
  source = await readFile(AGENT_PATH, 'utf8');
} catch (error) {
  fail(
    `required custom agent is missing or unreadable: ${AGENT_PATH} (${error.message})`,
  );
}

if (source) {
  try {
    const { frontmatter, prompt } = parseAgent(source);
    const promptCharacters = Array.from(prompt).length;
    const promptBytes = Buffer.byteLength(prompt, 'utf8');
    const fileBytes = Buffer.byteLength(source, 'utf8');

    if (frontmatter.name !== 'UCFitnessAgent') {
      fail('frontmatter name must be exactly "UCFitnessAgent"');
    }

    if (
      typeof frontmatter.description !== 'string' ||
      frontmatter.description.trim() === ''
    ) {
      fail('frontmatter description must be a non-empty string');
    }

    if (frontmatter['user-invocable'] !== true) {
      fail('frontmatter user-invocable must be true');
    }

    if (promptCharacters >= MAX_PROMPT_CHARACTERS) {
      fail(
        `prompt has ${promptCharacters} Unicode characters; it must stay below ${MAX_PROMPT_CHARACTERS}`,
      );
    }

    if (fileBytes >= MAX_PROFILE_BYTES) {
      fail(
        `profile has ${fileBytes} UTF-8 bytes; it must stay below the ${MAX_PROFILE_BYTES}-byte picker budget`,
      );
    }

    for (const reference of REQUIRED_PROMPT_REFERENCES) {
      if (!prompt.includes(reference)) {
        fail(`prompt must retain the SSoT reference "${reference}"`);
      }
    }

    try {
      const [
        hallmarkSource,
        licenseSource,
        upstreamSource,
        readmeSource,
        packageSource,
        nextAgentSource,
        nextReferenceSource,
      ] =
        await Promise.all([
          readFile(HALLMARK_SKILL_PATH, 'utf8'),
          readFile(HALLMARK_LICENSE_PATH, 'utf8'),
          readFile(HALLMARK_UPSTREAM_PATH, 'utf8'),
          readFile(README_PATH, 'utf8'),
          readFile(PACKAGE_PATH, 'utf8'),
          readFile(NEXT_AGENT_PATH, 'utf8'),
          readFile(NEXT_REFERENCE_PATH, 'utf8'),
        ]);
      const { frontmatter, prompt } = parseAgent(hallmarkSource);
      const packageJson = JSON.parse(packageSource);
      const nextVersion = packageJson.dependencies.next.replace(/^[^\d]*/, '');
      const eslintConfigNextVersion =
        packageJson.devDependencies['eslint-config-next'].replace(/^[^\d]*/, '');
      const { frontmatter: nextAgentFrontmatter } = parseAgent(nextAgentSource);

      if (frontmatter.name !== 'hallmark') {
        fail('Hallmark frontmatter name must be exactly "hallmark"');
      }

      if (frontmatter.version !== HALLMARK_VERSION) {
        fail(`Hallmark frontmatter version must be exactly "${HALLMARK_VERSION}"`);
      }

      if (
        typeof frontmatter.description !== 'string' ||
        frontmatter.description.trim() === ''
      ) {
        fail('Hallmark frontmatter description must be a non-empty string');
      }

      for (const reference of REQUIRED_HALLMARK_REFERENCES) {
        if (!hallmarkSource.includes(reference)) {
          fail(`Hallmark skill must retain the canonical reference "${reference}"`);
        }
      }

      for (const mode of REQUIRED_HALLMARK_MODES) {
        if (!prompt.includes(mode)) {
          fail(`Hallmark skill must retain the "${mode}" mode`);
        }
      }

      if (!licenseSource.includes('Copyright (c) 2026 Hallmark contributors')) {
        fail('Hallmark MIT attribution is missing');
      }

      if (!upstreamSource.includes(HALLMARK_COMMIT)) {
        fail('Hallmark upstream metadata must retain the pinned commit');
      }

      if (!readmeSource.includes('](.github/skills/hallmark/SKILL.md)')) {
        fail('README must link to the Hallmark skill');
      }

      if (nextVersion !== eslintConfigNextVersion) {
        fail('next and eslint-config-next versions must match');
      }

      if (
        nextAgentFrontmatter.name !== 'Next.js Expert' ||
        nextAgentFrontmatter['user-invocable'] !== true
      ) {
        fail('Next.js Expert must remain explicitly user-invocable');
      }

      if (
        typeof nextAgentFrontmatter.description !== 'string' ||
        nextAgentFrontmatter.description.trim() === ''
      ) {
        fail('Next.js Expert description must be a non-empty string');
      }

      if ('model' in nextAgentFrontmatter) {
        fail('Next.js Expert must inherit an available runtime model');
      }

      const nextVersionReferences = [
        [nextAgentSource, `Next.js version: ${nextVersion}.`, 'Next.js agent'],
        [nextReferenceSource, `uses Next.js ${nextVersion}.`, 'Next.js reference'],
        [readmeSource, `Next.js ${nextVersion} App Router`, 'README agent table'],
      ];

      for (const [referenceSource, expected, label] of nextVersionReferences) {
        if (!referenceSource.includes(expected)) {
          fail(`${label} must reference package Next.js ${nextVersion}`);
        }
      }

      const markdownFiles = await collectMarkdownFiles(HALLMARK_ROOT);
      const { checkedLinks, upstreamOnlyLinks } =
        await validateLocalMarkdownLinks(markdownFiles);

      for (const omittedPath of [`${HALLMARK_ROOT}/docs`, `${HALLMARK_ROOT}/site`]) {
        if (await pathExists(omittedPath)) {
          fail(`Hallmark demo or unrelated docs must not be vendored: ${omittedPath}`);
        }
      }

      if (process.exitCode !== 1) {
        console.log(
          `OK: Hallmark ${HALLMARK_VERSION} frontmatter and ${checkedLinks} Markdown references are valid (${upstreamOnlyLinks} upstream-only demo/docs links intentionally not vendored)`,
        );
      }
    } catch (error) {
      fail(`invalid Hallmark customization: ${error.message}`);
    }

    if (process.exitCode !== 1) {
      console.log(
        `OK: UCFitnessAgent frontmatter is valid; prompt=${promptCharacters} Unicode characters/${promptBytes} UTF-8 bytes; profile=${fileBytes} UTF-8 bytes`,
      );
    }
  } catch (error) {
    fail(`invalid UCFitnessAgent configuration: ${error.message}`);
  }
}
