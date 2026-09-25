// US-131: the README of a Jev game, generated from the game's own files so
// it cannot drift from what runs. The statechart diagram comes from the
// compiled machine itself, via @xstate/graph - the same machine the bots
// run - not from a second reading of turn.yaml.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import YAML from 'yaml';
import { toDirectedGraph } from '@xstate/graph';
import { loadTurn, LEFT } from './machine.mjs';
import { loadGameFiles } from './gameFiles.mjs';
import { gameDirectory } from './games.mjs';
import { allLibraries } from './libraryDocument.mjs';
import { genericLibrary, mergeLibraries } from './library.mjs';

/**
 * Where a game's README is written.
 */
export const readmeFile = (game) => path.join(gameDirectory(game), 'README.md');

const CLASSES = {
  safe: 'fill:#d9f2d9,stroke:#2e7d32',
  move: 'fill:#fff3cd,stroke:#b58900',
  busy: 'fill:#e3eefc,stroke:#1565c0',
};

/**
 * The name of what triggers an edge: the event, or `done`/`error` of the
 * state's actor, or `always`.
 */
function triggerOf(transition) {
  const { eventType } = transition;
  if (eventType === '') return 'always';
  if (eventType.startsWith('xstate.done.actor')) return 'done';
  if (eventType.startsWith('xstate.error.actor')) return 'error';
  if (eventType.startsWith('xstate.after')) return `after ${eventType.match(/\.(\d+)\./)?.[1] ?? '?'}ms`;
  return eventType;
}

function guardLabel(guard) {
  if (guard === undefined) return '';
  const parameters = Object.entries(guard.params ?? {}).map(([key, value]) => `${key}=${value}`);
  return ` [${[guard.type, ...parameters].join(' ')}]`;
}

const label = (transition) => `${triggerOf(transition)}${guardLabel(transition.guard)}`;

// A graph edge's ends are graph nodes or, for a target, the state node itself.
const keyOf = (end) => (end.stateNode ?? end).key;

/**
 * Every edge of `machine` as `{ from, to, text }`. @xstate/graph lists the
 * event-driven ones; eventless (`always`) transitions it leaves out are
 * read from the same machine's own state nodes. Leaving the table (QUIT
 * from a `safe` state, into the reserved `left`) is the same from every
 * safe state, so it is described once in the README, not drawn.
 */
function edgesOf(machine) {
  const edges = [];
  for (const child of toDirectedGraph(machine).children) {
    for (const edge of child.edges) edges.push({ from: keyOf(edge.source), to: keyOf(edge.target), text: label(edge.transition) });
  }
  for (const [from, node] of Object.entries(machine.root.states)) {
    const eventless = node.always ?? [];
    for (const transition of eventless) {
      const targets = transition.target ?? [];
      for (const target of targets) edges.push({ from, to: target.key, text: label({ ...transition, eventType: '' }) });
    }
  }
  return edges.filter((edge) => edge.to !== LEFT && edge.from !== LEFT);
}

/**
 * A Mermaid `stateDiagram-v2` of the machine.
 * @param {import('xstate').AnyStateMachine} machine
 */
export function mermaidOf(machine) {
  const states = Object.entries(machine.root.states).filter(([name]) => name !== LEFT);
  const lines = ['stateDiagram-v2', `  [*] --> ${machine.root.config.initial}`];
  for (const edge of edgesOf(machine)) lines.push(`  ${edge.from} --> ${edge.to} : ${edge.text}`);
  for (const [name, node] of states) {
    if (node.type === 'final') lines.push(`  ${name} --> [*]`);
  }
  for (const [tag, style] of Object.entries(CLASSES)) lines.push(`  classDef ${tag} ${style}`);
  for (const [name, node] of states) {
    for (const tag of Object.keys(CLASSES)) {
      if (node.tags.includes(tag)) lines.push(`  class ${name} ${tag}`);
    }
  }
  return lines.join('\n');
}

function machineOf(game, files) {
  const specific = allLibraries().find(({ title }) => title === game)?.library;
  const library = mergeLibraries(genericLibrary({}), specific);
  return loadTurn(files.turnFile, { library, questions: Object.keys(files.questions) }).machine;
}

const cell = (text) => String(text ?? '').replaceAll('|', String.raw`\|`).replaceAll(/\s+/g, ' ').trim();
const table = (header, rows) => [`| ${header.join(' | ')} |`, `| ${header.map(() => '---').join(' | ')} |`, ...rows.map((row) => `| ${row.map((each) => cell(each)).join(' | ')} |`)].join('\n');

function statesTable(machine) {
  const rows = Object.entries(machine.root.states).filter(([name]) => name !== LEFT).map(([name, node]) => {
    const tags = node.tags.join(', ');
    return [`\`${name}\``, tags, node.description ?? '(undocumented)'];
  });
  return table(['State', 'Tags', 'What it is for'], rows);
}

function playersTable(files) {
  const rows = Object.values(files.players).map((player) => [`\`${player.name}\``, player.description, player.floor, player.escalation]);
  return table(['Player', 'Description', 'Confidence floor', 'Escalation'], rows);
}

function questionsTable(files) {
  const rows = Object.entries(files.questions).map(([name, question]) => [`\`${name}\``, question.type, (question.instructions ?? '').split('\n', 1)[0]]);
  return table(['Question', 'Type', 'Asks'], rows);
}

/**
 * The whole README of `game`, as markdown.
 * @param {string} game a key of GAMES
 */
export function renderGameReadme(game) {
  const directory = gameDirectory(game);
  const files = loadGameFiles(directory);
  const machine = machineOf(game, files);
  const setup = YAML.parse(readFileSync(path.join(directory, 'table.yaml'), 'utf8'));
  const description = machine.root.description ?? '';
  return `# ${setup.preset}

Generated by \`bobp make jev-readme\` from \`games/${game}/\` - do not edit by
hand; a test fails when this file is stale. To change it, change the files
it is generated from (and give each state of \`turn.yaml\` a \`description\`).

${description.trim()}

## Try it

\`bobp make jev-table GAME=${game}\` hosts a table with ${setup.players.length} bots
(${setup.players.map((name) => `\`${name}\``).join(', ')}), dealt and ready, as
\`table.yaml\` says. \`bobp make jev-player GAME=${game} STRATEGY=<player>
CODE=<table code>\` seats one at a table you host yourself.

## A bot's turn

The statechart in \`turn.yaml\`, drawn from the machine the bots run. Green
states are \`safe\` (a bot asked to leave, by Ctrl-C or \`QUIT\`, leaves from
there); yellow are \`move\` (it is this bot's move); blue are \`busy\` (waiting
on Jev or the table).

\`\`\`mermaid
${mermaidOf(machine)}
\`\`\`

${statesTable(machine)}

## Players

Each is one file in \`players/\`: the game's questions, reworded.

${playersTable(files)}

## What Jev is asked

\`questions.yaml\`${files.rules ? ', citing the rules written out in `rules.yaml`' : ''}.

${questionsTable(files)}
`;
}
