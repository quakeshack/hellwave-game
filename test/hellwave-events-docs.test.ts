import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, test } from 'node:test';

import { clientEvent as id1ClientEvent, clientEventName } from '../../id1/Defs.ts';
import { clientEvent } from '../Defs.ts';
import { hellwaveServerEventNames } from '../Events.ts';

// `Events.ts` says which events Hellwave publishes on top of id1's and what they carry, `docs/events.md` documents
// them by hand. The compiler keeps the code honest, this keeps the document equal to it.

const eventsDoc = readFileSync(new URL('../docs/events.md', import.meta.url), 'utf8');

/**
 * Reads the names the event tables of the document list: the first cell of every row.
 * @returns {string[]} The documented event names, in the order of the document.
 */
function documentedNames() {
  const names = [];

  for (const line of eventsDoc.split('\n')) {
    const match = /^\|\s*([a-z][a-z0-9.-]*)\s*\|/.exec(line);

    if (match !== null && match[1] !== 'event') {
      names.push(match[1]);
    }
  }

  return names;
}

void describe('hellwave docs/events.md', () => {
  void test('documents every event Hellwave adds to id1\'s, and nothing else', () => {
    const inherited = new Set<unknown>(Object.values(id1ClientEvent).filter((value) => typeof value === 'number'));
    // the object spreads id1's enum, whose reverse mapping (opcode to name) comes along: names are not opcodes
    const ownOpcodes = Object.values(clientEvent).filter((opcode) => typeof opcode === 'number' && !inherited.has(opcode));
    const published = [
      ...hellwaveServerEventNames,
      ...ownOpcodes.map((opcode) => clientEventName(opcode)),
    ];
    const documented = documentedNames();

    assert.equal(new Set(documented).size, documented.length, 'an event is documented twice');
    assert.deepEqual([...documented].sort(), [...published].sort());
  });
});
