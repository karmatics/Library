/**
 * DictationDocs: the living documentation AND specification for the dictation experiment.
 * It is code on purpose: it ships with the app, renders on the page (Docs button), and is the first thing
 * the next LLM (or human) should read. Keep it truthful: when behaviour changes, change this file in the same patch.
 *
 * STRUCTURE (important, owner requirement): every section is its own small static method (secXxx) returning one
 * section object. The static getter "order" lists the method names in display order. To change a section, patch only
 * that method. To add a section, add a new method and add its name to "order". NEVER rewrite the whole file to
 * change one section, and NEVER shorten or simplify existing text while editing: the owner does not want any of it lost.
 * Add new text; replace old text only when it has become false, and then say so in the Decisions or Status section.
 *
 * Section fields: title, paras[], list[] (bullets), steps[] (numbered), defs[[term, meaning]], code (preformatted), callout.
 * NOTE for editors: do not write a closing script tag literally inside any string in this file.
 * NOTE: strings use single quotes; write apostrophes as the typographic character, never a straight quote.
 */
class DictationDocs {
  static get version() { return '0.4-spec'; }

  static get order() {
    return [
      'secWhatThisIs', 'secHowToUse', 'secDecisions', 'secGlossary',
      'secTwoCursors', 'secSegmentsJoints', 'secCapturing', 'secScenarioU2',
      'secTimestamps', 'secFastCorrection', 'secSpeechReplaces', 'secSpokenEditing',
      'secCommandSystem', 'secLiteral', 'secSpelling', 'secReplacementRules',
      'secTouch', 'secWhatYouSee', 'secCommandsLiteralRules',
      'secArchitecture', 'secInvariants', 'secKnownLimitations',
      'secAcceptance', 'secStatus', 'secRoadmap', 'secOpenQuestions'
    ];
  }

  static get sections() {
    return DictationDocs.order.map(name => {
      if (typeof DictationDocs[name] !== 'function') {
        return { title: 'MISSING SECTION METHOD: ' + name, callout: 'DictationDocs.order lists a method that does not exist. Add it or remove it from order.' };
      }
      try { return DictationDocs[name](); }
      catch (e) { return { title: 'ERROR IN SECTION METHOD: ' + name, callout: String(e && e.message || e) }; }
    });
  }

  // ------------------------------------------------------------------ sections

  static secWhatThisIs() {
    return {
      title: 'What this is',
      paras: [
        'This is a dictation tool built around one conviction: talking should never be interrupted by correcting, and correcting should never be interrupted by talking. Speech recognition is imperfect and, worse, it changes its mind. It hears “YouTube”, then “you too”, then, once the word “concert” arrives, “U2”. Most dictation tools hide all of this: they paste whatever the engine currently believes and leave you to repair the damage by hand, moving the caret away from where you were speaking and then finding your way back.',
        'Here, nothing the engine ever believed is thrown away immediately. Every revision is kept as a competing interpretation of the same stretch of speech, one of them is displayed, and the others are a click away. You can fix a word while you are still mid-sentence, and the words you are speaking keep landing exactly where they were going to land.',
        'The goal is the best dictation tool in the world that is also trivially simple for basic use. Dictation normally sucks because you constantly fix what it got wrong, and because fixing needs precise mouse work. This tool must work on a phone, in daylight, with a fat finger, without clicking between letters. Everything below serves those two goals: fluid and forgiving.',
        'Eventual home: a Chrome extension that drives any text field on any page. For now it is a standalone page (DictationExperiment) so the model and interaction can be perfected first.'
      ]
    };
  }

  static secHowToUse() {
    return {
      title: 'How to use this document (read first, implementing LLM)',
      paras: [
        'This document is also the specification. It is written for an implementer that has lots of tokens but may lack big-picture judgment, design taste, or memory of earlier threads. So: decisions already made are stated as rules. Do not relitigate them. Where the owner has not decided, the item is listed under “Open questions”; ask, do not guess. Work in small steps from the roadmap, one step per response.'
      ],
      list: [
        'Delivery protocol (as understood from the owner; confirm if unsure): each reply contains exactly ONE fenced code block. Inside it, each file is a container with a data-file attribute holding the project-relative path: a script container for .js files, a style container for CSS, a template container for HTML, a script container of type application/json for JSON. A whole-file replacement repeats the complete file. A surgical change uses data-method (for example DictationLattice.editWord) together with data-action set to patch, and contains only that method. Never send zip files, attachments, diffs in prose, or several code blocks.',
        'Prose outside the code block should be brief: what changed, what to test, and at most a few questions. Put explanations that future threads need into this file, not into chat.',
        'Keep this file truthful. If behaviour changes, update the relevant section and the Status section in the same response.',
        'No DOM access in DictationLattice or DictationPolicy. The model is the source of truth; the DOM is a projection.',
        'Prefer many small, pure, replayable functions over clever ones. Every new model behaviour must be expressible as an event in the log so DictationLattice.replay reproduces it.',
        'Taste rules (owner decisions): text never changes size; time is shown only by colour; no flashy animation; no modal dialogs during dictation; every interpretation the engine produced must be recoverable until aged out; any correction should take the fewest possible gestures; never make the user aim precisely.',
        'HOW TO EDIT THIS FILE: it is split into one static method per section (secXxx) plus the order list. Patch the single method you are changing (data-method="DictationDocs.secReplacementRules", data-action="patch"). To add a section, patch in a new method and patch the order getter. Never resend the whole file just to change a section, and never condense existing sections: the owner values the detail and does not want any lost. If a section grows past roughly 60 lines, split it into two methods.',
        'When the owner answers an open question, do three things in one reply: record the answer in secDecisions, remove the item from secOpenQuestions, and update the section that the decision affects.'
      ]
    };
  }

  static secDecisions() {
    return {
      title: 'Decisions log (owner decisions, do not relitigate)',
      paras: [
        'Newest decisions last within each group. These came directly from the owner. Each is also reflected in the relevant section; this list exists so a future reader can see at a glance what is settled.'
      ],
      list: [
        'CORE: speaking position and editing position are independent. Editing never moves the write head. The user may move the write head to an edit location, but never has to.',
        'CORE: all engine variations are saved with timestamps. Timestamps matter and must eventually support syncing dictation to video.',
        'CORE: reverting to something the engine previously suggested must be easier than typing something new.',
        'CORE: clicking anywhere in a word selects the word plus the nearest joint (the space at the nearer end). Punctuation keys act on the joint, Shift toggles capitalisation, letters replace the word. Nearness may be measured in letters or pixels.',
        'CORE: speech replaces a selected word only when the user explicitly asks for that. Selection alone never redirects speech.',
        'DOCS: documentation lives in small per-section methods so single sections can be patched. Existing documentation must never be condensed or lost.',
        'RULES: if the engine keeps getting a word wrong (a product name, a person’s name), the user must be able to fix it once by typing it, or by spelling it, and the tool learns a replacement for the future.',
        'RULES: a learned replacement must be editable, and must be rejectable after the fact. It never blocks the user, and rejecting it for one occurrence must be a single cheap gesture, because the word the engine produced is sometimes the word the user really wants.',
        'LITERAL: saying “literal” before a command or punctuation word (for example “literal comma”) writes the actual word instead of the punctuation or command.',
        'COMMANDS: the owner wants both spoken text commands and spoken editing commands. How editing commands are told apart from text is an open question (see Command system).'
      ]
    };
  }

  static secGlossary() {
    return {
      title: 'Glossary',
      defs: [
        ['Span', 'One engine result: one continuous stretch of recognised speech. Chrome identifies it by a result index inside a recognition session; the adapter turns that into a key like “3:1”.'],
        ['Segment', 'A piece of a span: either a plain text run, or a choice point.'],
        ['Choice point', 'A stretch of words for which more than one interpretation exists. Holds alternatives.'],
        ['Alternative (alt)', 'One interpretation of a choice point, with source (engine, nbest, user), first/last time seen and a count.'],
        ['engineAlt', 'What the engine currently believes at a choice point. Always tracked, even if the user overrode it. Raw truth.'],
        ['selected', 'What is displayed at a choice point. Equals engineAlt unless the user pinned another.'],
        ['Pinned', 'A human chose the selected alternative. Engine revisions may add alternatives but may never change a pinned selection.'],
        ['Joint', 'The space between two words. Carries user attributes: punctuation after the previous word, and forced capitalisation of the next word.'],
        ['Write head', 'The cyan bar. Where the next speech will be inserted. Moves only when the user deliberately moves it.'],
        ['Edit selection', 'The word (and nearest joint) the user is manipulating. Independent of the write head.'],
        ['Hot / warm / cold', 'Age tiers. Hot keeps full history, warm keeps a few alternatives, cold is plain text.'],
        ['Commit horizon', 'The point behind which text is considered stable enough to hand to the outside world (a real text field). Used by the future extension.'],
        ['Text command', 'A spoken word or phrase that is interpreted as punctuation or layout (period, comma, new paragraph). Applied at display time; reversible.'],
        ['Editing command', 'A spoken phrase that performs an action on the document (scratch that, capitalise that). Executed once, recorded in the log, undoable.'],
        ['Control command', 'A spoken phrase that controls the app itself (stop listening, copy to clipboard).'],
        ['Replacement rule', 'A learned or manual mapping from what the engine hears (one or more variants) to what should be written. Applied at display time; the raw words stay underneath.'],
        ['Literal', 'The escape word. “literal” followed by a word means: write that word as a plain word, bypassing commands and rules.'],
        ['Occurrence override', 'A per-occurrence decision (for example “write the plain words here”) stored against specific tokens, separate from any rule.'],
        ['Teach mode', 'A deliberate gesture where the user speaks a phrase and types what it should become, so the rule captures exactly what the engine really hears.']
      ]
    };
  }

  static secTwoCursors() {
    return {
      title: 'Two cursors, never confused',
      paras: [
        'The speaking cursor, which we call the write head, is the cyan bar. It marks where the next words you say will appear. It follows the newest speech automatically and it only moves when you deliberately move it: Alt+click on any phrase to dictate right after it, or click empty space to send it back to the end.',
        'The editing selection is a different thing entirely. It is the word and the space you are working on with the mouse or the keyboard. Selecting, retyping, punctuating and capitalising never move the write head. This is the whole point. You can pause, click a mistaken word, type the correct one, press Enter, and carry on speaking, and the speaking cursor never left the end of your sentence. You can edit something you said ten seconds ago without moving anything. A skilled user can even make small edits while still speaking, perhaps slowing down a little.',
        'The user may also choose to move the write head back to an edit location. That is allowed, it is just never required. If the user does not want the microphone capturing into the edit location, nothing about editing should move the insertion point there.',
        'The screen shows which is which: a glowing bar for where speech goes, a cyan highlight for the word being edited, a green highlight for the space being edited.'
      ]
    };
  }

  static secSegmentsJoints() {
    return {
      title: 'Segments and joints',
      paras: [
        'A sentence is not a string of characters; it is a chain of segments (the words) and joints (the spaces between them). A joint carries attributes: whether punctuation follows the previous word, and whether the next word begins with a capital letter. Because punctuation and capitalisation live on joints rather than inside words, they never collide with the word you are retyping, and neither one can accidentally overwrite the other.',
        'When you click a word you select two things at once: the word, and the nearest joint. Click the left half of the word and you get the joint before it; click the right half and you get the joint after it. It does not matter whether nearness is measured in pixels or letters, only that the user never has to aim. Example: click the “r” in “train”. That is near the start, so the selection is the word “train” plus the space before it. Then every keystroke has exactly one sensible meaning: letters belong to the word, punctuation and spaces and Shift belong to the joint.',
        'Worked example. The text is “we went home train leaves soon” and the user clicks the “r” in “train”. Typing a period puts a period on the previous word (“home.”), replacing any punctuation that was already there (so a comma becomes a period, not “,.”), and train becomes “Train” because a sentence ended. Tapping Shift flips whether “Train” is capitalised, which matters because engines often capitalise when they should not. Typing the letters “t r a m” instead replaces the word “train” with “tram” and leaves the joint alone.'
      ],
      list: [
        'Type letters: replaces the selected word. Enter, Space, or any punctuation key commits it. Escape cancels. Backspace edits what you have typed, or deletes the word if you have typed nothing.',
        'Type . , ; : ? or !: puts that punctuation on the joint, and a sentence-ending mark makes the next word start with a capital automatically.',
        'Press Space: clears punctuation on the joint, leaving a plain space.',
        'Tap Shift (press and release without another key): toggles capitalisation (see Open questions, item 1, for exactly which word).',
        'Left / Right arrows: move the selection to the previous / next word.',
        'Click a dotted word: also opens its list of alternatives with a curved leader line to the word. Click one to swap it in; the choice is pinned so the engine cannot overwrite it later.',
        'Alt+click a phrase, or click blank space: moves the write head (the only mouse action that does).',
        'Escape: deselect.'
      ]
    };
  }

  static secCapturing() {
    return {
      title: 'Capturing everything the engine says',
      paras: [
        'The engine (Web Speech) produces a stream of interim results for each stretch of speech, then one final result, sometimes with n-best alternatives. Interim results are guesses that get revised. The final result is the engine’s decision, but it is not necessarily better than an earlier interim: the earlier guess “YouTube” can be right while the final says “U2”, or the reverse. So we keep all of them.',
        'The adapter turns each result into an ingest event: a key (session number plus result index), the text, whether it is final, a confidence if any, and the arrival time. The lattice diffs the new text against what the engine believed last time (never against what the user selected). Unchanged words stay as text. A changed region becomes a choice point holding the old reading and the new reading, with first-seen and last-seen times. If the changed region later changes again, it gains another alternative. N-best alternatives from the final result are added as alternatives with source “nbest” and never change what the engine currently believes.',
        'What the engine has “decided” versus what is still tentative: a span is tentative until its final result arrives (span.final). Within a span, words that have not changed across several revisions are effectively stable even before the final. The future commit horizon uses this: a word is committable when its span is final, or when it has been unchanged for a configurable time. Until then it may still change under the user’s hands, which is why edits are stored as pins on the model and never as raw text.',
        'Even if the user never edits anything, the history is still kept for the hot and warm window, and the displayed text follows the engine. For example the engine turns “you too” into “U2” later; the display changes to “U2”, the choice point records both, and the time “you too” was first heard is not lost.'
      ]
    };
  }

  static secScenarioU2() {
    return {
      title: 'Worked scenario: YouTube / you too / U2',
      paras: [
        'This is the canonical test. “You” can be followed by “too”, “to” or “two”, and the engine may later decide the whole thing is the band. The Demo: U2 button replays it.'
      ],
      steps: [
        'Time 0.0s: interim “I’m going to the YouTube”. One span, one plain text segment. Span is live (green outline).',
        'Time 0.8s: interim “I’m going to the you too”. The diff sees “YouTube” replaced by “you too”. That region becomes a choice point with two alternatives: “YouTube” (first seen 0.0s) and “you too” (first seen 0.8s). Displayed: “you too”, the engine’s latest belief. Dotted underline appears.',
        'Time 1.6s: interim “I’m going to the U2 concert”. The changed region is replaced again; the choice point gains an alternative “U2 concert” (the changed region may swallow the adjacent new word “concert”; see Known limitations). Displayed: “U2 concert”.',
        'Time 2.4s: final “I’m going to the U2 concert tonight”. “tonight” is plain growth at the end and is appended as text. The span is now final. The outline turns off.',
        'Time 2.5s: n-best alternative “I’m going to the YouTube concert tonight”. Added as an alternative with source “nbest”. Displayed text is unchanged.',
        'The user clicks “U2”. The popover lists all readings, newest and selected first, each with source, count and age. Picking “YouTube concert” pins it: the engine can no longer overwrite it, and the correction “U2 concert → YouTube concert” is counted toward a learned rule. If the user picks the other direction twice, the app offers “Always: you too → U2”.',
        'Meanwhile the write head never moved. If the user kept talking during steps 5 and 6, the new words appeared at the end.'
      ]
    };
  }

  static secTimestamps() {
    return {
      title: 'Timestamps and synchronisation (spec; partly NOT built)',
      paras: [
        'Why it matters: the owner wants dictation that can be played back in time, for example synchronised with a video. This is a core requirement, not a nice-to-have. A dictation tool without accurate timing is worth much less.',
        'Today: the log records a wall-clock arrival time for every ingest, each alternative records first and last seen, and each span records createdAt and lastT. That is arrival time, which lags actual speech by roughly the engine’s latency. There is NO per-word spoken time, NO media clock, and the adapter does NOT forward speech-start, speech-end, sound-start or audio-start events to the lattice.',
        'Rule 1: a word’s time belongs to the speech, not to the revision. When “you too” (heard at 0.8s) is later rewritten as “U2” (arriving at 1.6s), the word “U2” inherits the time interval of the words it replaced. Revisions never move time. A user-typed replacement likewise inherits the interval of the word it replaced. Words typed with no speech behind them have no interval and are interpolated between their neighbours at export.',
        'Rule 2: keep both clocks. Every event carries wall time, a monotonic session time (performance.now relative to session start), and optionally a media time supplied by a callback (for example video.currentTime). Never derive one from another after the fact.',
        'Rule 3: timing is an estimate with known error and must be marked as such. Each word interval carries a quality tag: “measured” (aligned against recorded audio), “estimated” (heuristic below) or “interpolated”.',
        'Rule 4 (added with replacement rules): a replacement rule changes the written text, never the timing. If “cooper netties” (two words, one interval) is written as “Kubernetes” (one word), the written word takes the combined interval of the heard words. Likewise a command that is consumed (scratch that) keeps its own timed record in the log even though it leaves no text.'
      ],
      list: [
        'Estimation heuristic (v1, no audio): for each span record the arrival time of its first interim, the speech-start and speech-end events nearest to it, and the final arrival time. A word cannot have been spoken after the first interim that contained it, so firstSeen is an upper bound. Estimated spoken time of a word = firstSeen minus an assumed engine latency (calibratable, on the order of a few hundred milliseconds to a second), clamped so words stay in order and not before the speech-start event. Within one result, spread words between onset and offset in proportion to their character length.',
        'Better (v2, with audio): record the microphone with MediaRecorder at the same time as recognition, stamp the recording start on the same session clock, and later do forced alignment of the final text to the audio to replace estimated times with measured ones. Whether a second consumer of the microphone alongside SpeechRecognition works must be tested per browser; keep it optional.',
        'Data change required first: tokens need stable ids and become objects (id, text, t0, t1, quality, confidence). Stable ids also fix the joint-index problem. See Roadmap step 1.',
        'Export formats to support: JSON (full lattice with alternatives and times), WebVTT with per-word timestamp tags for karaoke-style captions, SRT per span, and plain text. WebVTT is the first target because browsers play it natively against a video.',
        'Playback: a scrubber that replays the document growing in time order, using the display state as it was (including superseded alternatives) or the final state, selectable. The log makes this possible because it records every event with its time.'
      ]
    };
  }

  static secFastCorrection() {
    return {
      title: 'Fast correction (spec)',
      paras: [
        'Principle: fixing a word back to something the engine previously said must be easier than typing a new word. The previous suggestions are already in the choice point.',
        'Target interactions, cheapest first: (1) a single gesture on a selected dotted word cycles to the next most recent alternative; (2) one click on a chip in the popover; (3) type a new word. The popover already does (2). Gesture (1) is not built; the key is an open question.',
        'Ordering of alternatives: selected first, then by recency of the engine believing it, then n-best, then user-typed. Show a tiny age and a count so “this was the engine’s guess two seconds ago” is obvious.',
        'The whole popover must be operable without aiming: large targets, and on touch devices a bottom sheet instead of a floating popover.'
      ]
    };
  }

  static secSpeechReplaces() {
    return {
      title: 'Speech that replaces a selection (spec; NOT built)',
      paras: [
        'By default speech goes to the write head and nothing else. The user can explicitly say “the next thing I say replaces this”. That is a mode, entered deliberately (a key, a button, or a spoken command such as “replace that”), applying to the currently selected word or phrase. The next final result replaces the selection (the old words become an alternative, so it is undoable), then the write head returns to where it was. This must never happen implicitly just because something is selected. The gesture is an open question.',
        'Replacement speech should inherit the replaced interval for timing (Rule 1) only if the user says so; otherwise it takes its own spoken time. This is an edge case; ask the owner before building.',
        'Relationship to teaching: this mode is also the natural way to fix a name by voice. Select the wrong word, enter replace mode, say or spell the right one. See Spelling and Replacement rules.'
      ]
    };
  }

  static secSpokenEditing() {
    return {
      title: 'Spoken editing commands (spec; NOT built)',
      paras: [
        'The owner wants spoken commands for editing as well. Commands must never be in danger of being typed as text accidentally, so they need a rule, such as a prefix word or a distinct pause pattern; this is not decided. Candidate commands: “scratch that” (undo last span or choice), “select <word>” (move the edit selection to the nearest occurrence), “capitalise that”, “no space”, “replace that”, “use previous” (cycle to the previous alternative of the selected choice).',
        'Existing display-time commands (period, comma, new paragraph, literal) are a different thing: they are text interpretation, not editing actions, and they are already implemented in DictationPolicy.',
        'The full design, including the recommended way to tell commands from text, is in the next section, Command system.'
      ]
    };
  }

  static secCommandSystem() {
    return {
      title: 'Command system (spec; only text commands are built)',
      paras: [
        'There are three kinds of spoken command, and they must not be handled the same way because their risks differ. A misread text command costs one wrong comma and is fixed by a click. A misread editing command can delete or change the user’s work. So the more destructive a command, the stricter the rule for recognising it.'
      ],
      defs: [
        ['Text commands', 'period, comma, question mark, exclamation point, colon, semicolon, new paragraph, new line. Display-time interpretation of tokens. Reversible by clicking (treat as plain words). BUILT, in DictationPolicy.commands.'],
        ['Editing commands', 'scratch that, undo, capitalise that, no space, select <word>, replace that, use previous. They act on the model. NOT BUILT.'],
        ['Control commands', 'stop listening, copy to clipboard, start editing. They act on the app. NOT BUILT in the new design. The old DictationWidget recognised “copy to clipboard” and “quick edit” at the very end of a final transcript; that is a useful precedent and shows the end-of-utterance trigger works in practice.']
      ],
      list: [
        'One registry. All three kinds live in one registry of command records, so they are discoverable, toggleable and documented in one place. A command record states what it is called, what it does, when it fires, and where it may appear (see the code example). DictationPolicy.commands today is the text-command part of this registry, as plain data.',
        'Recognition is on resolved tokens, longest phrase first, exactly like replacement rules, so a command is never recognised inside a pinned word the user typed.',
        'Text commands: fire at display time, anywhere in a span, while the span is still being revised. Safe because nothing is stored; if the engine revises, the display simply recomputes.',
        'Editing and control commands: fire only when STABLE, meaning the span is final, or the command words have been unchanged for a configurable time (default suggestion 700 ms). They fire once. The execution is recorded in the log as an event naming the span key and the token ids, so replay executes it from the log and never re-detects it, and so a later engine revision cannot make it fire a second time.',
        'RECOMMENDED trigger rule for editing and control commands (owner to confirm, see Open questions): a command fires only when the command phrase is the ENTIRE utterance, that is, the whole span (one stretch of speech between pauses) consists of exactly the command phrase. The engine already splits results at pauses, so a user simply pauses, says “scratch that”, and pauses. No prefix word needed, and the phrase “I will scratch that idea” inside a sentence is never mistaken for a command. Text commands do not need this rule. Alternatives if the owner dislikes it: a prefix word (for example “computer, scratch that”), or a push-to-talk key.',
        'Consumed command words are not part of the text. They are excluded from the exported text but remain in the model and are shown as a small dim chip with a check mark. Clicking the chip undoes the action and turns the words back into plain text (“I really did mean to say scratch that”).',
        'Undo. Every action command pushes an inverse on an undo stack stored as log events. “undo” and Ctrl+Z (when the surface has focus) pop it. Undo is itself recorded.',
        'The referent of “that”: if the user has an edit selection that was made in the last few seconds (suggestion: 8 s), “that” means the selected word; otherwise it means the most recent span. This is what lets mouse and voice cooperate: click a word, say “capitalise that”.',
        'No modal confirmation, ever, during dictation. Safety comes from undo and from the whole-utterance rule, not from asking.',
        'Per-occurrence control. Clicking a command word offers “Treat as plain words” for this occurrence only (default, one click), and “Never treat as a command here” for the phrase. Per-phrase exists today (policy.setDisabled). Per-occurrence needs stable token ids (Roadmap step 1) and is stored as an occurrence override event.'
      ],
      code: `// shape of a registry entry (illustrative; keep it plain data plus one function)
{
  id: 'scratch-that',
  phrases: ['scratch that', 'delete that'],
  kind: 'edit',              // text | edit | control
  fires: 'stable',           // display | stable
  scope: 'whole-span',       // anywhere | whole-span
  enabled: true,
  describe: 'Removes the most recent span, or the selected word.',
  run: (ctx) => { /* ctx.lattice, ctx.target, ctx.log; must log an event and push an undo */ }
}

// log events added by this system
{ t, op: 'command', id: 'scratch-that', spanKey: '3:1', tokenIds: [...] }
{ t, op: 'occurrenceOverride', tokenIds: [...], as: 'plain' }
{ t, op: 'undo' }`
    };
  }

  static secLiteral() {
    return {
      title: 'The “literal” escape (partly built)',
      paras: [
        'Owner requirement: sometimes the user wants the word, not the command. The escape is the word “literal”. Saying “literal comma” writes the word comma instead of a comma character. Saying “literal period” writes the word period. The same works for every text command and for every replacement rule, so “literal you too” writes “you too” even if a rule would turn it into “U2”.',
        'There are two ways to arrive at the same result and they must end in the same state. Before the fact: say “literal” first. After the fact: the engine produced a command or rule and the user clicks it and chooses “Treat as plain words”. Both mark those specific tokens as plain (an occurrence override). Neither one touches the rule or the command itself, so the next occurrence is unaffected.'
      ],
      list: [
        'Currently built: DictationPolicy treats the word “literal” followed by one non-empty item as a single item of kind “literal”, which bypasses commands, rules and auto-capitalisation. The surface shows it dashed yellow. Clicking it explains it. It cannot be toggled off per occurrence.',
        'Gap 1, multi-word protection: “literal” protects exactly one following word today. It must protect the whole phrase that WOULD have matched, longest match first. “literal new paragraph” must write the three words “new paragraph”, and “literal question mark” must write “question mark”. For one-word commands the current behaviour is already right, which is why this has not shown up yet.',
        'Gap 2, writing the escape word itself: “literal literal” writes the word “literal”. Say this in the docs for the user. In code: when the next item is also the escape word, write it as plain text.',
        'Gap 3, capitalisation: a literal word is an ordinary word and must still be capitalised at the start of a sentence. Today it is skipped by auto-capitalisation and also resets the capitalise-next flag. Fix so that only the text content is protected from interpretation, not from capitalisation.',
        'Gap 4, learning: if the user says “literal X” repeatedly for the same X after a rule fires, that is evidence the rule is wrong. Count it as a rejection of the rule (see Replacement rules, rejection).',
        'Interaction with engine auto-punctuation: some engines and devices turn the spoken word “comma” into the character themselves, before we see it. In that case we never receive the word and “literal comma” cannot be honoured by us. Test on each target browser and device and record the result here. If it happens, the fix is to tell the engine not to punctuate when that option exists, or to document the limitation.',
        'Spelling out a word letter by letter is the other escape hatch; see Spelling.'
      ]
    };
  }

  static secSpelling() {
    return {
      title: 'Spelling and teaching by letters (spec; NOT built)',
      paras: [
        'Owner requirement: when the engine keeps mishearing a name, the user can type it, or say the letters. Saying the letters is the hands-free path, and it must be good enough to teach the replacement too.',
        'Spell mode. The word “spell” (or “letters”) starts it. Every following single-letter token is joined into one word. It ends at the first token that is not a letter, or at a pause (a new span). “capital” before a letter uppercases that letter. Accept the usual spoken forms: plain letters, and the NATO alphabet (alpha, bravo, charlie, and so on) because engines are much better at those. Digits and the word “hyphen” are allowed inside a spelled word.',
        'Engines return spelled letters inconsistently (“J O H N”, “j o h n”, “jay oh aitch en”, or even the word “john”). Do the mapping in one small pure function with a table of homophones and test it against real recordings. Expect to tune it; keep the table in data, not in logic.',
        'The spelled result is a word with source “spell”. It is treated like a user-typed word: pinned, never rewritten by replacement rules, and keeps the timing of the letters it came from (one combined interval, per timing Rule 4).',
        'Teaching path. Spelling is mainly useful together with replace mode: select the wrong word, say “replace that”, say “spell k u b e r n e t e s”. The wrong word becomes an alternative (the lattice already stores it as the engine reading), the spelled word is pinned, and the correction is counted toward a rule exactly as a typed correction is. Typing and spelling therefore feed the same learning path.'
      ]
    };
  }

  static secReplacementRules() {
    return {
      title: 'Replacement rules and learning (partly built; this is the spec)',
      paras: [
        'The problem. Every time the user says a particular product or person name, the engine gets it wrong, often in several different ways on different days (“cooper netties”, “cooper nettys”, “kuber nettys”). The user wants to fix it once, by typing it or by spelling it, and have the tool write it correctly from then on. The user also wants the tool to be allowed to be wrong: sometimes the word the engine produced is a real word the user wants this time, so the replacement must never be in the way and must be easy to refuse after the fact.',
        'What exists today. The lattice counts every pinned correction as “heard|chose” (DictationLattice.corrections, DictationLattice.suggestedRules). The choice popover has a button “Always: X → Y” that adds a rule to DictationPolicy.rules (a Map from lowercase heard phrase to written string). The policy applies rules at display time, longest phrase first, before built-in commands. Clicking a rule word offers “Treat as plain words”, which disables that PHRASE (policy.disabled). Rules are NOT saved: they vanish on reload. There are no variants, counts, edit, or per-occurrence rejection yet.',
        'Principle 1: rules are a display-time view. Raw engine tokens are never altered, so every rule is reversible and every rule application can be inspected (“you said X, written Y”).',
        'Principle 2: rules never block. Whatever a rule wrote, the user can click it, pick something else, or type over it. Nothing asks permission and nothing refuses.',
        'Principle 3: teaching must cost almost nothing. The correction itself (typing or spelling over a word) is already the teaching act; the rule is a by-product, not a second task.'
      ],
      defs: [
        ['Heard', 'What the engine produced, normalised: lowercase, punctuation stripped, whitespace collapsed. A rule can have several heard variants for one written target.'],
        ['Write', 'The exact text to output. If it contains capitals (Kubernetes, iPhone) it is written exactly, including at sentence start.'],
        ['State', 'suggested (counted, not applied), learned (applied, auto-created), confirmed (applied, user made or approved it), disabled (kept but not applied).'],
        ['Applied / rejected counts', 'How many times the rule was used, and how many times the user refused it after the fact. Used for auto-demotion.']
      ],
      code: `// shape of a rule record (replaces the plain heard->write Map; keep rules.size working for the stats line)
{
  id: 'r12',
  heard: ['cooper netties', 'cooper nettys'],   // variants, normalised
  write: 'Kubernetes',
  caseMode: 'exact',          // exact | adapt  (adapt: capitalise at sentence start like a normal word)
  state: 'learned',           // suggested | learned | confirmed | disabled
  source: 'auto',             // auto | manual | taught | spelled
  created: 1730000000000,
  applied: 14,
  rejected: 1,
  scope: 'global'             // later: per document, per site (extension)
}

// log events
{ t, op: 'ruleAdd', rule }   { t, op: 'ruleEdit', id, patch }   { t, op: 'ruleState', id, state }
{ t, op: 'occurrenceOverride', tokenIds: [...], as: 'plain' }`,
      steps: [
        'OBSERVE. The user corrects a heard phrase to something else (picks an alternative, types over it, or spells it). The lattice already records heard|chose. Nothing else happens yet and nothing interrupts the user.',
        'FIRST CORRECTION. Next to the corrected word, show a small non-modal chip for a few seconds: “Always write Kubernetes?” with one button. Ignoring it costs nothing and it fades. The same offer remains in the choice popover as “Always: X → Y”.',
        'SECOND IDENTICAL CORRECTION (suggested threshold, owner may change it): create the rule automatically in state “learned”, apply it from now on, and show a one-line note “Will now write Kubernetes for cooper netties. Undo”. No dialog. This is the “smart enough” behaviour the owner asked for.',
        'NEW VARIANT. If the user corrects a different heard phrase to the written text of an existing rule, offer to add it as another variant of that rule instead of creating a second rule.',
        'APPLY. The policy replaces matching heard tokens by the written text, at display time, and gives the written word the combined timing interval of the heard words. Applied count goes up. Applied words are dashed amber, as today.',
        'REJECT AFTER THE FACT. The user clicks an amber word. The popover says “You said ‘cooper netties’, written ‘Kubernetes’” and offers, in this order: “Use what I said here” (this occurrence only; default; one click), “Stop replacing this” (disable the rule), “Change what it writes” (type or spell a new target), “Delete rule”. Later: “Only after/before…” for context. “Use what I said here” stores an occurrence override and increments the rule’s rejected count; it does not change the rule.',
        'AUTO-DEMOTE. If a rule is rejected on a meaningful share of its recent uses (suggestion: 3 rejections within its last 10 applications), set its state to suggested and say so quietly in the rules panel. The user is never lectured, and can re-enable it with one click.',
        'EDIT. The rules panel (not built) lists every rule: heard variants, written text, state, counts, and controls to toggle, edit (type or spell), delete, and add manually. It is the single place to see and repair the vocabulary.'
      ],
      list: [
        'Precedence, highest first: occurrence override (“plain words here”), the literal escape, user typed or spelled words (rules never apply to them), user rules, built-in commands. Within a level, longest phrase wins. Today rules already precede commands, as intended.',
        'Rules must not rewrite words the user typed or spelled or pinned from a user alternative. Today the policy cannot tell, because items carry only a pinned flag, not the alternative’s source. Fix: carry source on items. See Known limitations.',
        'Matching is on whole tokens, normalised (lowercase, punctuation stripped). Consider also matching with spaces ignored (“cooper netties” versus “coopernetties”) once there is a test set. Fuzzy or phonetic matching is a later experiment and must be OFF unless the user opts in, because a wrong automatic rewrite is worse than none.',
        'Teach mode (recommended, not built): a button “Teach a word”. The user speaks the phrase, then types or spells what it should be. The rule captures exactly what the engine really heard (it is the most reliable way to get the right heard variant, and it can capture several variants if the user says the phrase more than once). This avoids guessing from corrections.',
        'N-best use (open question): the engine’s alternative readings for a span often contain the correct name. Option: if any n-best alternative matches a rule, offer it as the top alternative in the choice popover. Do NOT change the displayed text on that basis without the owner’s decision.',
        'Persistence. Rules are the user’s personal vocabulary and must survive reloads. Page version: localStorage under a single versioned key (suggestion “dictation.rules.v1”), loaded at startup and saved on every change. Extension version: chrome.storage.sync. Provide export and import as JSON so the vocabulary can be backed up and shared. Wrap storage in try/catch; it can be unavailable.',
        'Hints to the engine. Some engines accept phrase hints or contextual biasing for names. Where available, feed the rule write-values to the engine as hints. Treat as an optional later improvement and feature-detect it; Chrome’s support varies by version.',
        'Replay. Rule changes are log events, so replaying a log reproduces the displayed text of the session as it was. Rules loaded from storage at startup are logged as an initial ruleAdd batch so a replay is self-contained.',
        'Case. If a rule’s write contains any capital, caseMode is exact, so “iPhone” stays “iPhone” and “Kubernetes” keeps its capital K even mid-sentence. If it is all lowercase, caseMode is adapt, so it is capitalised at the start of a sentence like any word.',
        'Timing. The written word takes the combined interval of the heard words it replaced (timing Rule 4). A rule never changes when something was said.'
      ]
    };
  }

  static secTouch() {
    return {
      title: 'Touch and phone use (spec; NOT built)',
      paras: [
        'The point of dictation is freedom from precise input, so the phone case is first-class, not an afterthought. Word-plus-joint selection exists precisely so that a tap anywhere on a word is enough. Needed: pointer events instead of mouse-only click handling, large hit areas, a bottom sheet for alternatives, an on-screen strip with punctuation and a capitalise toggle (replacing keyboard shortcuts), a way to move the write head by long-press, and no hover-only features.',
        'Added with rules and commands: the “Use what I said here” and “Stop replacing this” actions, the “Teach a word” button, and the spelling entry must all be reachable from the bottom sheet and the on-screen strip, with targets big enough for a thumb in sunlight.'
      ]
    };
  }

  static secWhatYouSee() {
    return {
      title: 'What you see',
      paras: [
        'Text never changes size. Calm beats clever: the page should feel like smooth glass. Time is shown quietly through colour only. Speech that is still being recognised sits in a soft green outline. Recent text is bright, older text settles to a gentler tone.',
        'A dotted cyan underline means the engine considered more than one reading. A solid purple underline means you chose a reading and pinned it. A dashed blue word is a spoken command (for example “period” or “new paragraph”), a dashed amber word is a learned replacement rule, and a dashed yellow word was forced literal. Click any of those to turn the interpretation off and keep the plain words.',
        'Planned additions, same quiet style: a dim chip with a check mark for a consumed editing command; a brief fading chip offering “Always write …?” after a first correction; a one-line “Will now write … Undo” note when a rule is auto-learned. No new colours beyond the existing set unless the owner asks.'
      ]
    };
  }

  static secCommandsLiteralRules() {
    return {
      title: 'Commands, literal and rules (as built today)',
      paras: [
        'Spoken punctuation (“period”, “comma”, “question mark”, “exclamation point”, “colon”, “semicolon”) and “new paragraph” / “new line” are interpreted at display time; the raw words are never altered underneath, so a misfired command is always reversible. Say “literal” before a word to bypass interpretation, for example “literal period” writes the word. Clicking a choice and pressing “Always: X → Y” teaches a replacement rule. Rules and commands are matched longest-phrase-first, and a rule can be switched off for a phrase by clicking it.',
        'This section describes the code as it is now. The intended design, including the gaps, is in Command system, The literal escape, Spelling, and Replacement rules.'
      ]
    };
  }

  static secArchitecture() {
    return {
      title: 'Architecture (for the next LLM)',
      paras: [
        'Layers, bottom to top. DictationEngineAdapter wraps Web Speech and turns recogniser results into ingest events. DictationLattice is the pure model: no DOM, event-sourced, replayable. DictationPolicy is a pure presentation transform over the resolved token stream (commands, rules, joints, capitalisation). LatticeSurface renders and handles input; it never reads a caret from the DOM, because the model is the source of truth and the DOM is only a projection. DictationExperiment is the small app that wires them together.',
        'Lattice data model. A span is one engine result (one stretch of speech). A span holds segments: plain text runs and choice points. A choice point holds alternatives: engineAlt is what the engine currently believes (always tracked, even when you have overridden it), selected is what is displayed, pinned means a human chose it. Engine revisions are diffed against the engine view, never against your selection, which is why your corrections survive further revisions. A revision that bridges several choice points merges them and re-pads every alternative to the full range, so five words that become one are replaced as a unit. Joints are stored per span as span.joints[resolvedIndex] = {punct, cap}.',
        'Aging. Hot spans keep full history; warm spans keep the selected, the engine reading and a few more; cold spans collapse to plain text. Interacting with a span (hover, edit) refreshes its age. The surface re-renders only when a tier changes, so it does not flicker. Note for timing: collapsing a cold span must not discard word timing, only alternatives.',
        'Replay. DictationLattice.replay(lattice.log) rebuilds a whole session from its event log, including edits and joint changes. Use it for regression tests.',
        'Where the new features belong. The command registry and the replacement rules are presentation and vocabulary: they live in DictationPolicy (or a new Library/DictationRules.js and Library/DictationCommands.js if DictationPolicy grows past about 300 lines), as pure code with no DOM. Persistence of rules is a thin wrapper around localStorage, kept in its own small module so the policy stays pure. Executing editing commands is a model operation and belongs in DictationLattice as logged events. The rules panel, the “Always write?” chip, the reject popover and the spelling UI belong in LatticeSurface (or a new Library/RulesPanel.js).'
      ],
      list: [
        'Library/DictationLattice.js: model, diff/merge, edits, joints, aging, replay.',
        'Library/DictationPolicy.js: commands, literal, rules, joint punctuation, capitalisation. Items carry idx, endIdx and jointKey so the surface can address any word or joint.',
        'Library/DictationEngineAdapter.js: Web Speech wrapper with lazy creation, single-owner microphone lock, restart back-off and give-up.',
        'Library/LatticeSurface.js: rendering, edit selection, keyboard and mouse handling, alternatives popover.',
        'Library/DictationDocs.js: this document.',
        'Library/DomBasics.js: makeElement and applyCss helpers, shared across the project.',
        'DictationExperiment/DictationExperiment.js: the app shell (buttons, demos, docs panel, stats).',
        'Library/DictationWidget.js: the OLDER contenteditable-based dictation widget with a floating tentative popup. It is superseded by the lattice design. Keep for reference; do not extend it.',
        'Library/DocumentReader.js: a general document viewer from a different project; unrelated to dictation. Do not touch it for this work.'
      ]
    };
  }

  static secInvariants() {
    return {
      title: 'Invariants and gotchas',
      paras: [
        'Never mutate raw engine tokens for presentation; use the policy. Never let the DOM decide where text goes. Never store raw character offsets outside the model. Joint indices are positions in the resolved stream of a span, so replacing one word with several words shifts later joints; this is a known limitation (stable token ids are the fix). Editing a word that is part of a multi-word spoken command only touches its first word. The browser allows a single speech recognizer at a time across tabs: the adapter releases it on stop, destroy and page hide, and refuses to hold it if two adapters collide. If other dictation tools stop working, check for a stale tab holding the microphone first.',
        'Stale files: DictationExperiment/js/DictationExperiment.js and DictationExperiment/index_legacy_recursi.html are leftovers from a different demo (a dialog-box example that also defines a class named DictationExperiment). The real app is DictationExperiment/DictationExperiment.js, loaded through luno.json. The legacy files should be deleted so they cannot shadow or confuse anything.',
        'Chrome’s speech engine gives confidence only on final results, and n-best alternatives only on final results; interim results report zero confidence. Do not treat zero confidence as “bad”.',
        'Chrome’s result indexes restart each time the recogniser restarts; the adapter prefixes keys with a session counter. Never build keys any other way.',
        'Rules and commands are recomputed on every render from the resolved tokens. Never cache their output in the model, or a later engine revision will leave stale rewrites behind.',
        'An editing command must never fire from an interim result that the engine may still revise. Fire only when stable, and only once, keyed by span key and token ids.'
      ]
    };
  }

  static secKnownLimitations() {
    return {
      title: 'Known limitations in the current code',
      list: [
        'Choice regions can swallow neighbouring words: the alternative for “you too” becomes “U2 concert”, not just “U2”. Fix: at display time, trim the common leading and trailing tokens shared by all alternatives of a choice and show only the differing core, keeping the model unchanged.',
        'The write head can sit only between spans, never inside one. A user who wants to dictate into the middle of an existing sentence cannot yet. Needs stable token ids and a write-head position expressed as (span, token id).',
        'Timing is arrival time only (see Timestamps).',
        'Shift toggles capitalisation of the word AFTER the selected joint, which may not be the word the user clicked. See Open questions, item 1.',
        'Typing over a word that is still being revised by the engine works through pinning, but there is no “touched” flag, so a revision that overlaps typed text can still produce an extra alternative. Harmless but noisy.',
        'Spoken commands interpreted by the policy are per-phrase toggles, not per-occurrence.',
        'No touch support; keyboard shortcuts have no on-screen equivalent.',
        'Stats line and banner in the app shell still say v0.2.',
        'Replacement rules are in memory only: they are lost on reload. Persistence is the cheapest high-value fix.',
        'Rules are plain heard-to-written pairs: no variants, no counts, no state, no edit, no rules panel, no per-occurrence rejection, no automatic learning (only the manual “Always” button).',
        'Rules can rewrite words the user typed or pinned, because policy items do not carry the source of the chosen alternative. Fix: pass the alternative source through DictationLattice.items and let the policy skip user and spell sources.',
        'The literal escape protects only one following word, does not capitalise at the start of a sentence, cannot be toggled per occurrence, and there is no way to say the word “literal” itself.',
        'No spelling mode, no teach mode, no replace-selection-by-speech, no editing commands, no command registry beyond the plain data in DictationPolicy.commands.'
      ]
    };
  }

  static secAcceptance() {
    return {
      title: 'Acceptance scenarios (write these as replay tests)',
      paras: [
        'Each scenario is a list of timed ingest events plus user actions, replayed through DictationLattice.replay, with assertions on the displayed text and on the model. Build a tiny test page that runs them and prints pass or fail, so a less capable LLM can verify its own work.'
      ],
      steps: [
        'U2 scenario: events as in the worked scenario. Assert displayed text is “I’m going to the U2 concert tonight”, the choice point has at least three alternatives, and the engine’s first reading “YouTube” still exists with first-seen time 0.',
        'Pin survives revision: after pinning “YouTube”, ingest a further revision with “U2”. Assert displayed text still shows “YouTube” and engineAlt is “U2”.',
        'Revert is cheap: from a displayed engine guess, select an earlier alternative in one action. Assert pinned is true and the correction is counted.',
        'Joint edit: click-left on a word, type a period. Assert the previous word has a period, any previous punctuation was replaced, and the clicked word is capitalised.',
        'Shift toggle: capitalise then un-capitalise a word that the engine capitalised wrongly. Assert the model stores cap false.',
        'Write head stability: while a word is edited, ingest new speech. Assert the new words land at the write head, not at the edit selection.',
        'Edit does not move write head: perform ten edits; assert writeAfter is unchanged.',
        'Timing inheritance (after tokens get ids and times): “you too” heard at 0.8s becomes “U2” at 1.6s. Assert U2 carries the interval of “you too”, not 1.6s.',
        'Aging: advance the injected clock past warm and cold thresholds. Assert alternatives shrink, then collapse, and word times survive.',
        'Replay determinism: replay a recorded log twice and assert identical resolved text.',
        'Literal comma: ingest “I said literal comma and left”. Assert displayed text contains the word “comma” as a word and no comma character was produced.',
        'Literal multi-word: ingest “literal new paragraph”. Assert the three-character-free result: the words “new paragraph” appear and no break is produced.',
        'Literal literal: ingest “literal literal”. Assert the word “literal” is written once.',
        'Literal capitalisation: ingest “hello period literal comma”. Assert the written word “Comma” is capitalised because a sentence ended.',
        'Rule applies: add rule “cooper netties” to “Kubernetes”, ingest “we use cooper netties daily”. Assert displayed text “We use Kubernetes daily” and the raw tokens still read “cooper netties”.',
        'Auto-learn: correct the same heard phrase to the same text twice. Assert a rule in state “learned” now exists and a third ingest of the phrase displays the written text.',
        'Reject once: click-reject a rule-written word with “Use what I said here”. Assert that occurrence shows the heard words, the rule is unchanged except rejected count plus one, and the next occurrence is rewritten again.',
        'Auto-demote: apply a rule ten times and reject three. Assert its state becomes “suggested” and it is no longer applied.',
        'Rule vs user text: type “Kubernetes” over a word; ingest a later revision that would trigger a rule on that location. Assert the typed word is untouched.',
        'Persistence: save rules, reload the page, assert the same rules exist and the log of a new session begins with their ruleAdd events.',
        'Command only when whole utterance: ingest a span “scratch that” and assert the previous span is removed and a consumed chip exists. Ingest a span “I will scratch that idea” and assert nothing is removed.',
        'Command fires once: after “scratch that” fires, ingest a revision of the same span with the same words. Assert the previous span is not removed a second time.',
        'Undo: after “scratch that”, say “undo”. Assert the span is back and the consumed chip is gone.',
        'Spelling: ingest “spell k u b e r n e t e s”. Assert one pinned word “kubernetes” with source spell, and that no rule rewrote it.'
      ]
    };
  }

  static secStatus() {
    return {
      title: 'Status',
      list: [
        'DONE: lattice with diffing, merging, aging, learning and replay; policy layer (commands, literal, rules, joint punctuation, auto-capitalisation); hardened speech adapter; word-and-joint editing with typing, punctuation and Shift; alternatives popover with leader line; manual rule learning via “Always”; app shell with demos and this documentation (now split into per-section methods).',
        'PARTIAL: timestamps (arrival time only); write head (between spans only); fast revert (popover only, no cycle gesture); replacement rules (in memory, plain pairs, manual teach only, per-phrase disable); literal (one following word only); text commands (built, per-phrase toggle only).',
        'NOT BUILT: per-word spoken time and media clock; stable token ids; replace-selection-by-speech mode; editing and control commands and the command registry; rule persistence, rules panel, variants, counts, states, auto-learn, per-occurrence rejection, teach mode; spelling mode; touch support; exports (JSON, WebVTT, SRT); playback scrubber; test page for replay scenarios; commit-horizon adapter and Chrome extension; audio recording and alignment.',
        'SPEC ONLY IN THIS VERSION OF THE DOCS: Command system, The literal escape (gaps), Spelling, Replacement rules (lifecycle, record shape, precedence).'
      ]
    };
  }

  static secRoadmap() {
    return {
      title: 'Roadmap (each step small enough for one response)',
      steps: [
        'Stable token ids and token objects in the lattice (id, text, t0, t1, quality). Migrate joints from index keys to token ids. Update policy and surface to match. Update replay. This unlocks timing, mid-span write head, per-occurrence overrides and robust joints. Highest risk step: do it alone, keep behaviour identical, and add the replay test page in the same step.',
        'Test page: a simple page that runs the acceptance scenarios against the lattice and prints results.',
        'Rule persistence and rule records: store rules as records (heard variants, write, state, counts), save and load through localStorage, keep policy.rules.size working. Does not need token ids. Highest value for lowest risk, so do it early.',
        'Carry the alternative source through DictationLattice.items into policy items, and make rules skip user and spell sources.',
        'Literal fixes: protect the whole matching phrase, allow “literal literal”, capitalise normally. Add the matching acceptance tests.',
        'Rejection after the fact: reject popover on an amber word with “Use what I said here”, “Stop replacing this”, “Change what it writes”, “Delete rule”; counts; auto-demote. Per-phrase first, per-occurrence once step 1 is done.',
        'Auto-learn: the fading “Always write …?” chip after a first correction, and automatic creation on the second identical correction with an undo note; variants.',
        'Rules panel: list, toggle, edit, delete, add manually, export and import JSON.',
        'Teach mode: “Teach a word” (say the phrase, then type the target).',
        'Adapter: forward audio-start, sound-start, speech-start, speech-end and end events to the lattice as timed marks, with wall, session and optional media clocks.',
        'Lattice: assign word intervals using the estimation heuristic; inheritance rule on revision, on typed replacement and on rule application; interpolation for untimed words.',
        'Display trimming: show only the differing core of each choice (fixes the swallowed-neighbour problem).',
        'Cycle gesture for alternatives (key decided by owner) and an on-screen control for touch.',
        'Command registry as plain data, then editing commands with the whole-utterance rule (if confirmed), stable-fire-once, consumed chips and undo.',
        'Spelling mode (spell, capital, NATO alphabet) with the letter-mapping table kept as data.',
        'Replace-selection-by-speech mode, which also gives the hands-free way to fix a name.',
        'Export: JSON, then WebVTT with word tags, then SRT, then plain text.',
        'Playback scrubber over the log, with an optional video element and a sync mark.',
        'Touch layout: pointer events, bottom sheet, on-screen punctuation strip, on-screen versions of rule and command actions.',
        'MediaRecorder capture and optional forced alignment for measured times.',
        'Commit-horizon adapter writing only stable text into a real textarea or contenteditable; then the Chrome extension and floating buffer for editors that cannot be controlled. In the extension, rules move to chrome.storage.sync and may gain a per-site scope.'
      ]
    };
  }

  static secOpenQuestions() {
    return {
      title: 'Open questions for the owner (ask these, do not guess)',
      paras: [
        'Record the owner’s answers directly in this section when they arrive, then move the decision into the Decisions log and the relevant section above.'
      ],
      steps: [
        'Shift toggle target: should tapping Shift always capitalise or un-capitalise the word the user clicked, regardless of which joint was chosen? The current code toggles the word after the selected joint, which differs when the right half of a word was clicked. Proposed: Shift always acts on the clicked word; punctuation keys act on the joint; auto-capitalisation after a sentence end acts on the word after that joint.',
        'Sync source for video: should the page host a video element and read its currentTime, or is a “mark sync” button pressed at the moment the video starts enough, or should dictation just record its own timeline and the user aligns later?',
        'Gesture for “next speech replaces the selection”: a key, a button, a double-click, or a spoken command?',
        'Gesture for cycling through earlier engine guesses: Up and Down arrows while a word is selected? (Letters are reserved for typing over the word.)',
        'Spoken editing commands: use a prefix word, a pause pattern, or a push-to-talk key to tell commands from text? Recommended: the command must be the entire utterance (whole span), no prefix. See Command system.',
        'Timing accuracy needed: is estimated timing within a second acceptable, or is recording audio for forced alignment required from the start?',
        'Pins and rules: should a pin made today bias future recognition of the same phrase automatically, or only when the user presses “Always”? Related proposal in Replacement rules: auto-create a rule on the second identical correction.',
        'Should aged-out (cold) spans keep their alternatives in the exported JSON, or only the final text and times?',
        'Auto-learn threshold: is two identical corrections the right moment to create a rule automatically, or should one correction be enough, or should it always need a click?',
        'Auto-demote: is “three rejections in the last ten uses” a good default, or should rejection never change a rule on its own?',
        'N-best and rules: may a rule’s written text be offered as the top alternative when the engine’s n-best list contains the heard variant, even if the displayed reading differs?',
        'Rule scope: one global vocabulary, or separate vocabularies per document (and per site in the extension)?',
        'Teach mode: is “say the phrase, then type the target” the right flow, or would the owner rather teach only by correcting in place?',
        'The referent of “that” in commands: selection if recent, otherwise the latest span. Is eight seconds a sensible window, and should it be configurable?',
        'Spelling: should a spelled word ever be rewritten by a rule (proposed: never), and should it automatically offer to become a rule for the phrase the engine had heard?'
      ]
    };
  }

  // ------------------------------------------------------------------ rendering

  static render(container) {
    const h = LatticeSurface.h;
    container.replaceChildren();
    const wrap = h('div', { style: { maxWidth: '820px', margin: '0 auto', padding: '24px 20px 80px', color: '#e2e8f0', fontFamily: "'Plus Jakarta Sans',-apple-system,system-ui,sans-serif", lineHeight: '1.7', fontSize: '15px' } });
    wrap.appendChild(h('h1', { style: { fontSize: '26px', margin: '0 0 4px', color: '#f8fafc' } }, 'Dictation Experiment'));
    wrap.appendChild(h('div', { style: { color: '#00f2fe', fontSize: '13px', fontWeight: '700', marginBottom: '4px' } }, 'Speak at one place. Edit at another. Never lose your train of thought.'));
    wrap.appendChild(h('div', { style: { color: '#64748b', fontSize: '12px', marginBottom: '20px' } }, 'Docs and spec, version ' + DictationDocs.version));
    for (const s of DictationDocs.sections) {
      wrap.appendChild(h('h2', { style: { fontSize: '17px', color: '#00f2fe', margin: '26px 0 8px', borderBottom: '1px solid #1e293b', paddingBottom: '4px' } }, s.title));
      (s.paras || []).forEach(p => wrap.appendChild(h('p', { style: { margin: '0 0 12px' } }, p)));
      if (s.defs) wrap.appendChild(h('dl', { style: { margin: '0 0 12px' } }, s.defs.map(([t, d]) => [
        h('dt', { style: { fontWeight: '700', color: '#f8fafc', marginTop: '8px' } }, t),
        h('dd', { style: { margin: '2px 0 0 18px', color: '#cbd5e1' } }, d)
      ]).flat()));
      if (s.list) wrap.appendChild(h('ul', { style: { margin: '0 0 12px 20px', padding: '0' } }, s.list.map(li => h('li', { style: { margin: '4px 0' } }, li))));
      if (s.steps) wrap.appendChild(h('ol', { style: { margin: '0 0 12px 22px', padding: '0' } }, s.steps.map(li => h('li', { style: { margin: '5px 0' } }, li))));
      if (s.code) wrap.appendChild(h('pre', { style: { background: '#070a13', border: '1px solid #1e293b', borderRadius: '8px', padding: '10px 12px', overflow: 'auto', fontSize: '12.5px', color: '#7dd3fc' } }, s.code));
      if (s.callout) wrap.appendChild(h('div', { style: { borderLeft: '3px solid #f59e0b', background: 'rgba(245,158,11,.08)', padding: '8px 12px', margin: '0 0 12px', borderRadius: '0 6px 6px 0' } }, s.callout));
    }
    container.appendChild(wrap);
  }
}

globalThis.DictationDocs = DictationDocs;
if (typeof module !== 'undefined' && module.exports) module.exports = DictationDocs;