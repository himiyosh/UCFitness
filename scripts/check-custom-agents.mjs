import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const AGENT_PATH = fileURLToPath(
  new URL('../.github/agents/UCFitnessAgent.agent.md', import.meta.url),
);
const MAX_PROMPT_CHARACTERS = 30_000;
const TARGET_MIN_CHARACTERS = 20_000;
const TARGET_MAX_CHARACTERS = 25_000;

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

    if (
      promptCharacters < TARGET_MIN_CHARACTERS ||
      promptCharacters > TARGET_MAX_CHARACTERS
    ) {
      fail(
        `prompt has ${promptCharacters} Unicode characters; keep the orchestrator target between ${TARGET_MIN_CHARACTERS} and ${TARGET_MAX_CHARACTERS}`,
      );
    }

    if (process.exitCode !== 1) {
      console.log(
        `OK: UCFitnessAgent frontmatter is valid; prompt=${promptCharacters} Unicode characters; file=${fileBytes} bytes`,
      );
    }
  } catch (error) {
    fail(`invalid UCFitnessAgent configuration: ${error.message}`);
  }
}
