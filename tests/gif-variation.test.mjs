import assert from 'node:assert/strict';
import test from 'node:test';
import { nextGifVariation } from '../lib/gif-variation.mjs';

test('dance rotation covers thirty-two named routines before repeating and avoids boundary repeats', t => {
  t.mock.method(Math, 'random', () => 0);
  const prompts = Array.from({ length: 32 }, () => nextGifVariation('dance'));
  const names = prompts.map(prompt => prompt.match(/Dance: ([^.]+)\./)?.[1]);
  assert.deepEqual(names, [
    'Twerking', 'Running Man', 'Macarena', 'Meatstick', 'Griddy', 'Pole dance',
    'Moonwalk', 'Robot', 'Carlton', 'Floss', 'Gangnam Style', 'Chicken Dance',
    'YMCA', 'Disco Point', 'Hammer Shuffle', 'Cabbage Patch', 'Sprinkler',
    'Lawnmower', 'Shopping Cart', 'Worm', 'Mashed Potato', 'Twist', 'Charleston',
    'Hokey Pokey', 'Bunny Hop', 'Electric Slide', 'Cha Cha Slide', 'Cotton Eye Joe',
    'Dougie', 'Crank That', 'Dab', 'Vogue',
  ]);
  assert.equal(new Set(prompts).size, 32);
  assert.notEqual(nextGifVariation('dance'), prompts.at(-1));
  assert.match(prompts[4], /heel.*wing.*eyes/);
  assert.match(prompts[5], /pole.*spin/);
});
