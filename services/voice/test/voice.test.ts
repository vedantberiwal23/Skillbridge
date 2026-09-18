import assert from 'node:assert/strict';
import { speakable } from '../src/sarvam/tts.js';
import { splitSentences } from '../src/sarvam/client.js';

console.log('--- Running Voice Service Unit Tests ---');

// Test 1: speakable() guard
console.log('Testing speakable()...');
assert.equal(speakable(' '), false, 'Whitespace must not be speakable');
assert.equal(speakable('\n\n'), false, 'Newlines must not be speakable');
assert.equal(speakable('.'), false, 'Lone period must not be speakable');
assert.equal(speakable(','), false, 'Lone comma must not be speakable');
assert.equal(speakable('('), false, 'Lone parenthesis must not be speakable');
assert.equal(speakable(';'), false, 'Lone semicolon must not be speakable');
assert.equal(speakable('Hello'), true, 'English word must be speakable');
assert.equal(speakable('नमस्ते'), true, 'Hindi word must be speakable');
assert.equal(speakable('2.5 bar'), true, 'Words with numbers and units must be speakable');
console.log('✔ speakable() tests passed.');

// Test 2: splitSentences()
console.log('Testing splitSentences()...');
const englishText = 'Check the valve. It is leaking! Can you fix it?';
const englishSplit = splitSentences(englishText);
assert.deepEqual(englishSplit, ['Check the valve.', 'It is leaking!', 'Can you fix it?']);

const hindiText = 'वॉल्व को चेक करें। यह ठीक है।';
const hindiSplit = splitSentences(hindiText);
assert.deepEqual(hindiSplit, ['वॉल्व को चेक करें।', 'यह ठीक है।']);

const decimalText = 'The pressure is 2.5 bar right now. Do not exceed 3.0 bar.';
const decimalSplit = splitSentences(decimalText);
assert.deepEqual(decimalSplit, [
  'The pressure is 2.5 bar right now.',
  'Do not exceed 3.0 bar.',
]);
console.log('✔ splitSentences() tests passed (including Devanagari danda and decimal preservation).');

console.log('--- All Voice Service Unit Tests Passed! ---');
