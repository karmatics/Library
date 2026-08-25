class InstrumentSounds {
  constructor(options = {}) {
    this.basePath = options.basePath || './';
    this.audioContext = null;
    this.wafPlayer = null;
    this.pianoPlayer = null;
    this.tinySynth = null;
    this.isLoading = false;
    this._loadPromise = null;
    this.globalTranspose = 0;

    this.tracks = [
      { instrument: 'Piano', volume: 5.0, octaveShift: 0 },
      { instrument: 'Vibes', volume: 5.0, octaveShift: 0 },
    ];

    this.instrumentDefs = {
      Piano: { engine: 'waf', key: '0000_JCLive_sf2_file' },
      Vibes: { engine: 'waf', key: '0110_FluidR3_GM_sf2_file' },
      'Electric Guitar': { engine: 'waf', key: '0260_JCLive_sf2_file' },
      'Wurlitzer EP': { engine: 'waf', key: '0051_FluidR3_GM_sf2_file' },
      Marimba: { engine: 'waf', key: '0120_FluidR3_GM_sf2_file' },
      'Steel Drum': { engine: 'waf', key: '1140_Chaos_sf2_file' },
      Harp: { engine: 'waf', key: '0460_GeneralUserGS_sf2_file' },
      'Music Box': { engine: 'waf', key: '0100_Chaos_sf2_file' },
      'Choir Aahs': { engine: 'waf', key: '0520_FluidR3_GM_sf2_file' },
      Celesta: { engine: 'tiny', key: 'Celesta' },
      Chimes: { engine: 'tiny', key: 'Chimes' },
      Blocks: { engine: 'tiny', key: 'Blocks' },
      Synth: { engine: 'tiny', key: 'Synth' },
    };

    this.availableInstruments = Object.keys(this.instrumentDefs);
    this.activeWafNotes = {};
    this.activeTinyNotes = {};

    try {
      this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
      this._addResumeListeners();
      this.wafPlayer = new WafPlayer(this.audioContext);
      this.tinySynth = new TinySynth(this.audioContext);
    } catch (e) {
      console.error('InstrumentSounds: Failed to create AudioContext:', e);
    }
  }

  _addResumeListeners() {
    if (!this.audioContext) return;
    const resume = () => {
      this.resumeContext().finally(() => {
        document.body.removeEventListener('click', resume, { capture: true });
        document.body.removeEventListener('keydown', resume, { capture: true });
      });
    };
    document.body.addEventListener('click', resume, { once: true, capture: true });
    document.body.addEventListener('keydown', resume, { once: true, capture: true });
  }

  async ensureAudioReady() {
    await this.resumeContext();
    if (this.tracks[0] && this.tracks[0].instrument) {
      await this.setActiveInstrument(this.tracks[0].instrument);
    }
  }

  resumeContext() {
    if (this.audioContext && this.audioContext.state === 'suspended') {
      return this.audioContext.resume();
    }
    return Promise.resolve();
  }

  getAvailableInstruments() {
    return [...this.availableInstruments];
  }

  async setActiveInstrument(instrumentName) {
    if (!this.audioContext) throw new Error('AudioContext not available.');
    const def = this.instrumentDefs[instrumentName];
    if (!def) throw new Error(`Instrument "${instrumentName}" is not defined.`);

    await this.setTrackInstrument(0, instrumentName);

    if (def.engine === 'waf') {
      if (!this.wafPlayer) throw new Error('WAF player not initialized.');
      if (!this.wafPlayer.activePresets[instrumentName]) {
        const variableName = `_tone_${def.key}`;
        const url = `https://surikov.github.io/webaudiofontdata/sound/${def.key}.js`;
        await this.wafPlayer.loader.loadInstrument(instrumentName, url, variableName);
      }
      this.activeInstrument = instrumentName;
      this.activeEngine = 'waf';
      return;
    }

    if (def.engine === 'tiny') {
      if (!this.tinySynth) this.tinySynth = new TinySynth(this.audioContext);
      this.activeInstrument = instrumentName;
      this.activeEngine = 'tiny';
      return;
    }
  }

  noteOn(midiCode, velocity = 100, trackId = 0, debugInfo = {}) {
    if (this.isLoading) return null;

    if (!this.tracks[trackId]) {
      this.tracks[trackId] = { instrument: trackId === 1 ? 'Vibes' : 'Piano', volume: 5.0, octaveShift: 0 };
    }
    const track = this.tracks[trackId];
    const instName = track.instrument;
    const def = this.instrumentDefs[instName];
    if (!def) return null;

    const finalMidi = midiCode + this.globalTranspose + (track.octaveShift || 0) * 12;
    const volMult = (track.volume !== undefined ? track.volume : 5.0) / 10.0;

    if (velocity <= 0) return null;

    if (def.engine === 'waf' && this.wafPlayer) {
      const key = `${trackId}_${midiCode}`;
      if (this.activeWafNotes[key]) this.wafPlayer.cancel(this.activeWafNotes[key]);
      if (!this.wafPlayer.activePresets[instName]) {
        this.setActiveInstrument(instName).then(() => {
          this.noteOn(midiCode, velocity, trackId, debugInfo);
        }).catch(err => console.warn('[InstrumentSounds] Lazy load error:', err));
        return null;
      }
      const envelope = this.wafPlayer.playNote(instName, finalMidi, velocity, volMult);
      if (envelope) this.activeWafNotes[key] = envelope;
      return envelope;
    } else if (def.engine === 'tiny' && this.tinySynth) {
      const key = `${trackId}_${midiCode}`;
      if (this.activeTinyNotes[key]) this.tinySynth.noteOff(0, this.activeTinyNotes[key]);
      const noteObj = this.tinySynth.noteOn(finalMidi, velocity * volMult, def.key);
      if (noteObj) this.activeTinyNotes[key] = noteObj;
      return noteObj;
    }
    return null;
  }

  noteOff(midiCode, trackId = 0, specificHandle = null) {
    const track = this.tracks[trackId] || this.tracks[0];
    const instName = track.instrument;
    const def = this.instrumentDefs[instName];
    const finalMidi = midiCode + this.globalTranspose + (track.octaveShift || 0) * 12;

    if (def.engine === 'waf' && this.wafPlayer) {
      if (specificHandle) {
        this.wafPlayer.noteOff(specificHandle);
        const key = `${trackId}_${midiCode}`;
        if (this.activeWafNotes[key] === specificHandle) delete this.activeWafNotes[key];
      } else {
        const key = `${trackId}_${midiCode}`;
        const envelope = this.activeWafNotes[key];
        if (envelope) {
          this.wafPlayer.noteOff(envelope);
          delete this.activeWafNotes[key];
        }
      }
    } else if (def.engine === 'tiny' && this.tinySynth) {
      if (specificHandle) {
        this.tinySynth.noteOff(finalMidi, specificHandle);
        const key = `${trackId}_${midiCode}`;
        if (this.activeTinyNotes[key] === specificHandle) delete this.activeTinyNotes[key];
      } else {
        const key = `${trackId}_${midiCode}`;
        const noteObj = this.activeTinyNotes[key];
        if (noteObj) {
          this.tinySynth.noteOff(finalMidi, noteObj);
          delete this.activeTinyNotes[key];
        }
      }
    }
  }

  stopAllNotes() {
    if (this.wafPlayer) {
      this.wafPlayer.stopAllNotes(this.activeWafNotes);
      this.activeWafNotes = {};
    }
    if (this.tinySynth) {
      this.tinySynth.offAllNotes();
      this.activeTinyNotes = {};
    }
  }

  setVolume(v) {
    if (this.wafPlayer) this.wafPlayer.setMasterVolume(v * 0.45);
    if (this.tinySynth) this.tinySynth.setMasterVolume(v * 0.8);
  }

  setTranspose(semitones) {
    this.globalTranspose = parseInt(semitones) || 0;
  }

  async setTrackInstrument(trackId, instrumentName) {
    if (!this.tracks[trackId]) {
      this.tracks[trackId] = { instrument: 'Piano', volume: 3.0, transpose: 0 };
    }
    const def = this.instrumentDefs[instrumentName];
    if (!def) return;

    this.stopNotesForTrack(trackId);

    if (def.engine === 'waf' && this.wafPlayer) {
      if (!this.wafPlayer.activePresets[instrumentName]) {
        const varName = `_tone_${def.key}`;
        const url = `https://surikov.github.io/webaudiofontdata/sound/${def.key}.js`;
        try {
          await this.wafPlayer.loader.loadInstrument(instrumentName, url, varName);
        } catch (e) {
          console.error(`[InstrumentSounds] ❌ Failed to load ${instrumentName}`, e);
        }
      }
    }
    this.tracks[trackId].instrument = instrumentName;
  }

  setInstrument(name) {
    return this.setTrackInstrument(0, name);
  }

  setTrackVolume(trackId, volume) {
    if (this.tracks[trackId]) this.tracks[trackId].volume = volume;
  }

  setTrackTranspose(trackId, semitones) {
    if (this.tracks[trackId]) this.tracks[trackId].transpose = parseInt(semitones) || 0;
  }

  setTrackOctave(trackId, shift) {
    if (!this.tracks[trackId]) {
      this.tracks[trackId] = { instrument: 'Piano', volume: 3.0, octaveShift: 0 };
    }
    this.tracks[trackId].octaveShift = parseInt(shift) || 0;
  }

  async restoreTrackState(trackConfigs) {
    if (!Array.isArray(trackConfigs)) return;
    const promises = trackConfigs.map(async (cfg, index) => {
      if (!cfg) return;
      if (!this.tracks[index]) {
        this.tracks[index] = { instrument: index === 1 ? 'Vibes' : 'Piano', volume: 5.0, octaveShift: 0 };
      }
      if (cfg.volume !== undefined) this.tracks[index].volume = cfg.volume;
      if (cfg.octaveShift !== undefined) this.tracks[index].octaveShift = cfg.octaveShift;
      if (cfg.instrument && cfg.instrument !== this.tracks[index].instrument) {
        await this.setTrackInstrument(index, cfg.instrument);
      }
    });
    await Promise.all(promises);
  }

  stopNotesForTrack(trackId) {
    Object.keys(this.activeWafNotes).forEach((key) => {
      if (key.startsWith(`${trackId}_`)) {
        this.wafPlayer.cancel(this.activeWafNotes[key]);
        delete this.activeWafNotes[key];
      }
    });
    Object.keys(this.activeTinyNotes).forEach((key) => {
      if (key.startsWith(`${trackId}_`)) {
        this.tinySynth.noteOff(0, this.activeTinyNotes[key]);
        delete this.activeTinyNotes[key];
      }
    });
  }
}

globalThis.InstrumentSounds = InstrumentSounds;
if (typeof module !== "undefined" && module.exports) module.exports = InstrumentSounds;