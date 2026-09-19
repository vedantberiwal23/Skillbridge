import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as coach from '../src/voice/coach.js';

test('sentences split on the danda and survive decimals', () => {
  const { sentences, rest } = coach.cutSentences('पंप बंद करें और pressure 2.5 bar पर रखें। फिर valve खोलें। और');
  assert.deepEqual(sentences, ['पंप बंद करें और pressure 2.5 bar पर रखें।', 'फिर valve खोलें।']);
  assert.equal(rest, 'और');
});

test('a short opening sentence merges forward instead of wedging', () => {
  const { sentences } = coach.cutSentences('Yes. The pump must be isolated first. ');
  assert.deepEqual(sentences, ['Yes. The pump must be isolated first.']);
});

test('script check tolerates English technical terms in an Indic answer', () => {
  assert.equal(coach.scriptFits('Hydraulic pump को', 'hi-IN'), 'right');
  assert.equal(coach.scriptFits('Pump ka pressure zero hona chahiye', 'hi-IN'), 'wrong');
  assert.equal(coach.scriptFits('Pump', 'hi-IN'), 'unknown');
  assert.equal(coach.scriptFits('पंप', 'ta-IN'), 'wrong');
});

test('voice language follows the script written, recogniser breaks the Devanagari tie', () => {
  assert.equal(coach.languageOfText('पंप बंद करा', 'mr-IN'), 'mr-IN');
  assert.equal(coach.languageOfText('पंप बंद करें', 'en-IN'), 'hi-IN');
  assert.equal(coach.languageOfText('Close the valve'), 'en-IN');
});

test('romanised guess and native-script final are recognised as the same question', () => {
  assert.equal(coach.sameQuestion('pump kholne se pehle kya karna hai', 'पंप खोलने से पहले क्या करना है'), true);
  assert.equal(coach.sameQuestion('drafts kya hota hai', 'ग्राफ्स क्या होता है'), false);
});

test('restart when the final heard more words, or a different known language', () => {
  assert.equal(coach.needsRestart({ input: 'pump kya', spoken: null }, 'पंप खोलने से पहले क्या करना है', 'hi-IN'), true);
  assert.equal(coach.needsRestart({ input: 'pump kholne se pehle kya karna hai', spoken: 'hi-IN' }, 'पंप खोलने से पहले क्या करना है', 'hi-IN'), false);
  assert.equal(coach.needsRestart({ input: 'pump kholne se pehle kya karna hai', spoken: 'hi-IN' }, 'पंप उघडण्यापूर्वी काय करायचे', 'mr-IN'), true);
});

test('history is clamped and never starts with the assistant', () => {
  const msgs = coach.messagesFrom([{ role: 'assistant', content: 'hi' }, { role: 'user', content: 'x'.repeat(2000) }], 'q');
  assert.equal(msgs[0]!.role, 'user');
  assert.ok(msgs[0]!.content.length < 700);
  assert.equal(msgs.at(-1)!.role, 'user');
});

test('a model loop is detected', () => {
  assert.equal(coach.looksDegenerate('valve matlab valve matlab valve matlab valve'), true);
});
