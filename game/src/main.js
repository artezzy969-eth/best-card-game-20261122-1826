// Ember Court — main.js
// Wires the game together: creates the state, binds input, runs the
// render loop, drives AI turns on a visible delay, and plays WebAudio
// bleeps. Classic script, no modules. Expects the shared contract:
// newEmberGame, emberStartRound, emberAiTakeTurn, emberRender,
// emberBindInput, emberApplyShot.

(function () {
  'use strict';

  var AI_DELAY_MS = 700;
  var aiTimer = null;
  var audioCtx = null;

  // Sound is on by default; M toggles it (see input.js).
  if (typeof window !== 'undefined' && typeof window.__emberSoundOn === 'undefined') {
    window.__emberSoundOn = true;
  }

  function readSeed() {
    try {
      var seed = new URLSearchParams(window.location.search).get('seed');
      var n = parseInt(seed, 10);
      return isNaN(n) ? 1 : n;
    } catch (e) {
      return 1;
    }
  }

  // Lazily created on the first user gesture, so browsers allow audio.
  function ensureAudio() {
    if (audioCtx) return audioCtx;
    try {
      var AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      audioCtx = new AC();
    } catch (e) {
      audioCtx = null;
    }
    return audioCtx;
  }

  // One short WebAudio bleep. No audio files, no network.
  function emberBeep(freq, dur) {
    if (window.__emberSoundOn === false) return;
    var ctx = ensureAudio();
    if (!ctx) return;
    try {
      if (ctx.state === 'suspended') ctx.resume();
      var osc = ctx.createOscillator();
      var gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.12, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + (dur || 0.12));
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + (dur || 0.12));
    } catch (e) { /* audio is cosmetic; never break the game for it */ }
  }

  function beepForPhase(state, previousPhase) {
    if (state.phase === 'won' && previousPhase !== 'won') {
      // Win arpeggio: 523 + 659 + 784 Hz, stepped.
      emberBeep(523, 0.14);
      setTimeout(function () { emberBeep(659, 0.14); }, 130);
      setTimeout(function () { emberBeep(784, 0.25); }, 260);
    } else if (state.phase === 'lost' && previousPhase !== 'lost') {
      emberBeep(220, 0.35);
    }
  }

  function emberMain() {
    if (typeof newEmberGame !== 'function') {
      // Shared-contract blocker: report it, do not invent another API.
      throw new Error('Ember Court: newEmberGame is missing (B2 cards.js not loaded)');
    }
    var seed = readSeed();
    var state = newEmberGame(seed);
    window.__emberGame = state;

    // First user gesture unlocks audio.
    var unlock = function () { ensureAudio(); };
    document.addEventListener('pointerdown', unlock, { once: true });
    document.addEventListener('keydown', unlock, { once: true });

    // Screenshot / demo states, applied before the first render.
    if (typeof emberApplyShot === 'function') {
      try { emberApplyShot(state); } catch (e) { /* a bad shot never blocks play */ }
    }

    var previousPhase = state.phase;
    var previousChain = state.lastChain;

    function restart() {
      var fresh = newEmberGame(seed);
      // Replace the contents, not the object, so the input binding
      // (which closed over this state) keeps working.
      Object.keys(state).forEach(function (k) { delete state[k]; });
      Object.assign(state, fresh);
      window.__emberGame = state;
      if (typeof emberApplyShot === 'function') {
        try { emberApplyShot(state); } catch (e) { /* ignore */ }
      }
      previousPhase = state.phase;
      previousChain = state.lastChain;
      emberBeep(660, 0.1);
    }

    function start() {
      if (state.phase !== 'title') return;
      if (typeof emberStartRound === 'function') {
        emberStartRound(state);
      } else {
        state.phase = 'playing';
      }
      emberBeep(660, 0.12);
    }

    function play(index) {
      if (typeof emberPlayCard !== 'function') return;
      var beforeChain = state.lastChain;
      emberPlayCard(state, 'player', index);
      if (state.lastChain && state.lastChain !== beforeChain) {
        emberBeep(880, 0.15); // chain bonus
      } else {
        emberBeep(660, 0.12); // plain play
      }
      beepForPhase(state, previousPhase);
      previousPhase = state.phase;
      previousChain = state.lastChain;
    }

    emberBindInput(state, {
      getState: function () { return state; },
      onPlay: play,
      onStart: start,
      onRestart: restart,
      onToggleSound: function () {
        window.__emberSoundOn = window.__emberSoundOn === false;
      }
    });

    var firstRender = true;
    function loop() {
      // AI turns run on a visible ~700ms delay, one timer at a time,
      // only while it is the AI's turn in a live game.
      if (state.phase === 'playing' && state.turn === 'ai' && aiTimer === null) {
        aiTimer = setTimeout(function () {
          aiTimer = null;
          if (state.phase !== 'playing' || state.turn !== 'ai') return;
          var beforeChain = state.lastChain;
          if (typeof emberAiTakeTurn === 'function') {
            emberAiTakeTurn(state);
            if (state.lastChain && state.lastChain !== beforeChain) {
              emberBeep(880, 0.15);
            } else {
              emberBeep(440, 0.1);
            }
            beepForPhase(state, previousPhase);
            previousPhase = state.phase;
            previousChain = state.lastChain;
          }
        }, AI_DELAY_MS);
      }
      if (typeof emberRender === 'function') emberRender(state);
      if (state.phase !== previousPhase) {
        beepForPhase(state, previousPhase);
        previousPhase = state.phase;
      }
      if (state.lastChain !== previousChain) previousChain = state.lastChain;
      if (firstRender) {
        firstRender = false;
        window.__emberReady = true;
      }
      requestAnimationFrame(loop);
    }
    requestAnimationFrame(loop);
  }

  window.emberBeep = emberBeep;
  window.emberMain = emberMain;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', emberMain);
  } else {
    emberMain();
  }
})();
