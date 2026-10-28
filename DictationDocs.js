/**
 * DictationDocs: the living documentation for the dictation experiment.
 * It is code on purpose: it ships with the app, renders on the page (📖 Docs button), and is the first thing
 * the next LLM (or human) should read. Keep it truthful: when behaviour changes, change this file in the same patch.
 */
class DictationDocs {
  static get sections() {
    return [
      {
        title: 'What this is',
        paras: [
          'This is a dictation tool built around one conviction: talking should never be interrupted by correcting, and correcting should never be interrupted by talking. Speech recognition is imperfect and, worse, it changes its mind. It hears "YouTube", then "you too", then, once the word "concert" arrives, "U2". Most dictation tools hide all of this: they paste whatever the engine currently believes and leave you to repair the damage by hand, moving the caret away from where you were speaking and then finding your way back.',
          'Here, nothing the engine ever believed is thrown away immediately. Every revision is kept as a competing interpretation of the same stretch of speech, one of them is displayed, and the others are a click away. You can fix a word while you are still mid-sentence, and the words you are speaking keep landing exactly where they were going to land.'
        ]
      },
      {
        title: 'Two cursors, never confused',
        paras: [
          'The speaking cursor, which we call the write head, is the cyan bar. It marks where the next words you say will appear. It follows the newest speech automatically and it only moves when you deliberately move it: Alt+click on any phrase to dictate right after it, or click empty space to send it back to the end.',
          'The editing selection is a different thing entirely. It is the word and the space you are working on with the mouse or the keyboard. Selecting, retyping, punctuating and capitalising never move the write head. This is the whole point. You can pause, click a mistaken word, type the correct one, press Enter, and carry on speaking, and the speaking cursor never left the end of your sentence. You are free to attend to the end of the sentence, to the thing you are fixing, or to both at once, and the screen shows you which is which: a glowing bar for where speech goes, a cyan highlight for the word you are editing, a green highlight for the space you are editing.'
        ]
      },
      {
        title: 'Segments and joints',
        paras: [
          'A sentence is not a string of characters; it is a chain of segments (the words) and joints (the spaces between them). A joint carries attributes: whether punctuation follows the previous word, and whether the next word begins with a capital letter. Because punctuation and capitalisation live on joints rather than inside words, they never collide with the word you are retyping, and neither one can accidentally overwrite the other.',
          'When you click a word you select two things at once: the word, and the nearest joint. Click the left half of the word and you get the joint before it; click the right half and you get the joint after it. You always get both, so you never have to aim precisely. Then every keystroke has exactly one sensible meaning: letters belong to the word, punctuation and spaces and Shift belong to the joint.'
        ],
        list: [
          'Type letters: replaces the selected word. Enter, Space, or any punctuation key commits it. Escape cancels. Backspace edits what you have typed, or deletes the word if you have typed nothing.',
          'Type . , ; : ? or !: puts that punctuation on the joint after the word, and a sentence-ending mark makes the next word start with a capital automatically.',
          'Press Space: clears punctuation on the joint, leaving a plain space.',
          'Tap Shift (press and release without another key): toggles whether the next word is capitalised.',
          'Left / Right arrows: move the selection to the previous / next word.',
          'Click a dotted word: also opens its list of alternatives with a curved leader line to the word. Click one to swap it in; the choice is pinned so the engine cannot overwrite it later.',
          'Alt+click a phrase, or click blank space: moves the write head (the only action that does).',
          'Escape: deselect.'
        ]
      },
      {
        title: 'What you see',
        paras: [
          'Text never changes size. Calm beats clever: the page should feel like smooth glass. Time is shown quietly through colour only. Speech that is still being recognised sits in a soft green outline. Recent text is bright, older text settles to a gentler tone.',
          'A dotted cyan underline means the engine considered more than one reading. A solid purple underline means you chose a reading and pinned it. A dashed blue word is a spoken command (for example "period" or "new paragraph"), a dashed amber word is a learned replacement rule, and a dashed yellow word was forced literal. Click any of those to turn the interpretation off and keep the plain words.'
        ]
      },
      {
        title: 'Commands, literal and rules',
        paras: [
          'Spoken punctuation ("period", "comma", "question mark", "exclamation point", "colon", "semicolon") and "new paragraph" / "new line" are interpreted at display time; the raw words are never altered underneath, so a misfired command is always reversible. Say "literal" before a word to bypass interpretation, for example "literal period" writes the word. Clicking a choice and pressing "Always: X → Y" teaches a replacement rule. Rules and commands are matched longest-phrase-first, and a rule can be switched off for a phrase by clicking it.'
        ]
      },
      {
        title: 'Architecture (for the next LLM)',
        paras: [
          'Layers, bottom to top. DictationEngineAdapter wraps Web Speech and turns recogniser results into ingest events. DictationLattice is the pure model: no DOM, event-sourced, replayable. DictationPolicy is a pure presentation transform over the resolved token stream (commands, rules, joints, capitalisation). LatticeSurface renders and handles input; it never reads a caret from the DOM, because the model is the source of truth and the DOM is only a projection. DictationExperiment is the small app that wires them together.',
          'Lattice data model. A span is one engine result (one stretch of speech). A span holds segments: plain text runs and choice points. A choice point holds alternatives: engineAlt is what the engine currently believes (always tracked, even when you have overridden it), selected is what is displayed, pinned means a human chose it. Engine revisions are diffed against the engine view, never against your selection, which is why your corrections survive further revisions. A revision that bridges several choice points merges them and re-pads every alternative to the full range, so five words that become one are replaced as a unit. Joints are stored per span as span.joints[resolvedIndex] = {punct, cap}.',
          'Aging. Hot spans keep full history; warm spans keep the selected, the engine reading and a few more; cold spans collapse to plain text. Interacting with a span (hover, edit) refreshes its age. The surface re-renders only when a tier changes, so it does not flicker.',
          'Replay. DictationLattice.replay(lattice.log) rebuilds a whole session from its event log, including edits and joint changes. Use it for regression tests.'
        ],
        list: [
          'Library/DictationLattice.js: model, diff/merge, edits, joints, aging, replay.',
          'Library/DictationPolicy.js: commands, literal, rules, joint punctuation, capitalisation. Items carry idx, endIdx and jointKey so the surface can address any word or joint.',
          'Library/DictationEngineAdapter.js: Web Speech wrapper with lazy creation, single-owner microphone lock, restart back-off and give-up.',
          'Library/LatticeSurface.js: rendering, edit selection, keyboard and mouse handling, alternatives popover.',
          'Library/DictationDocs.js: this document.',
          'DictationExperiment/: the app shell (buttons, demos, docs panel).'
        ]
      },
      {
        title: 'Invariants and gotchas',
        paras: [
          'Never mutate raw engine tokens for presentation; use the policy. Never let the DOM decide where text goes. Never store raw character offsets outside the model. Joint indices are positions in the resolved stream of a span, so replacing one word with several words shifts later joints; this is a known limitation (stable token ids are the fix). Editing a word that is part of a multi-word spoken command only touches its first word. The browser allows a single speech recognizer at a time across tabs: the adapter releases it on stop, destroy and page hide, and refuses to hold it if two adapters collide. If other dictation tools stop working, check for a stale tab holding the microphone first.'
        ]
      },
      {
        title: 'Status and roadmap',
        paras: [
          'Done: lattice with diffing, merging, aging, learning and replay; policy layer; hardened speech adapter; word-and-joint editing; alternatives popover with leader line; this documentation.',
          'Next, roughly in order: stable token ids so joints survive length-changing edits; typing directly at the write head; a "touched" flag so engine revisions never overwrite typed text; a revision scrubber for the last thirty seconds; the commit-horizon adapter that writes only stable text into a real textarea or contenteditable on any page (the browser-extension use); a floating buffer for pages whose editors cannot be controlled; per-occurrence command toggles; touch support.'
        ]
      }
    ];
  }

  static render(container) {
    const h = LatticeSurface.h;
    container.replaceChildren();
    const wrap = h('div', { style: { maxWidth: '820px', margin: '0 auto', padding: '24px 20px 80px', color: '#e2e8f0', fontFamily: "'Plus Jakarta Sans',-apple-system,system-ui,sans-serif", lineHeight: '1.7', fontSize: '15px' } });
    wrap.appendChild(h('h1', { style: { fontSize: '26px', margin: '0 0 4px', color: '#f8fafc' } }, 'Dictation Experiment'));
    wrap.appendChild(h('div', { style: { color: '#00f2fe', fontSize: '13px', fontWeight: '700', marginBottom: '20px' } }, 'Speak at one place. Edit at another. Never lose your train of thought.'));
    for (const s of DictationDocs.sections) {
      wrap.appendChild(h('h2', { style: { fontSize: '17px', color: '#00f2fe', margin: '26px 0 8px', borderBottom: '1px solid #1e293b', paddingBottom: '4px' } }, s.title));
      (s.paras || []).forEach(p => wrap.appendChild(h('p', { style: { margin: '0 0 12px' } }, p)));
      if (s.list) wrap.appendChild(h('ul', { style: { margin: '0 0 12px 20px', padding: '0' } }, s.list.map(li => h('li', { style: { margin: '4px 0' } }, li))));
    }
    container.appendChild(wrap);
  }
}

globalThis.DictationDocs = DictationDocs;
if (typeof module !== 'undefined' && module.exports) module.exports = DictationDocs;