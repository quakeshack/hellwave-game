import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

const { generateRandomPlayerName } = await import('../client/NameGenerator.ts');

void describe('generateRandomPlayerName', () => {
  void test('combines an adjective, a noun, and a 0-99 number with no separator', () => {
    const originalRandom = Math.random;
    Math.random = () => 0; // deterministic: first adjective, first noun, number 0

    try {
      assert.match(generateRandomPlayerName(), /^[A-Z][a-z]+[A-Z][a-z]+0$/);
    } finally {
      Math.random = originalRandom;
    }
  });

  void test('picks the last adjective/noun/number when Math.random rolls just under 1', () => {
    const originalRandom = Math.random;
    Math.random = () => 0.999999;

    try {
      assert.match(generateRandomPlayerName(), /^[A-Z][a-z]+[A-Z][a-z]+99$/);
    } finally {
      Math.random = originalRandom;
    }
  });

  void test('produces some variety across repeated calls', () => {
    const names = new Set(Array.from({ length: 20 }, () => generateRandomPlayerName()));

    assert.ok(names.size > 1, 'expected more than one distinct name across 20 real (non-mocked) calls');
  });
});
