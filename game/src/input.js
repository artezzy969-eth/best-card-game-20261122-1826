// Ember Court — input.js
// Mouse + keyboard input. Classic script, no modules.
// emberBindInput(state, callbacks) where callbacks may provide:
//   onPlay(index)       — play the player's hand card at index
//   onStart()           — leave the title screen and start round 1
//   onRestart()         — start a fresh game with the same seed
//   onToggleSound()     — flip the sound flag
//   getState()          — return the current state (main.js swaps the
//                         state object in place, so the bound state is
//                         normally enough; getState is a safety net)
// Missing callbacks fall back to the shared contract functions
// (emberPlayCard / emberStartRound / newEmberGame) when they exist.

(function () {
  'use strict';

  function currentState(state, callbacks) {
    if (callbacks && typeof callbacks.getState === 'function') {
      try {
        var s = callbacks.getState();
        if (s) return s;
      } catch (e) { /* fall through to the bound state */ }
    }
    if (typeof window !== 'undefined' && window.__emberGame) return window.__emberGame;
    return state;
  }

  function handRects(state) {
    if (state && state._hit && state._hit.length) return state._hit;
    if (typeof window !== 'undefined' && window.__emberHandRects) return window.__emberHandRects;
    return [];
  }

  function canPlay(state, index) {
    if (typeof emberCanPlay === 'function') {
      try { return !!emberCanPlay(state, 'player', index); } catch (e) { return false; }
    }
    var card = state.playerHand && state.playerHand[index];
    return !!card && card.cost <= (state.playerMana || 0);
  }

  function playCard(state, callbacks, index) {
    if (!state || state.phase !== 'playing' || state.turn !== 'player') return false;
    if (!state.playerHand || index < 0 || index >= state.playerHand.length) return false;
    if (!canPlay(state, index)) return false;
    if (callbacks && typeof callbacks.onPlay === 'function') {
      callbacks.onPlay(index);
      return true;
    }
    if (typeof emberPlayCard === 'function') {
      emberPlayCard(state, 'player', index);
      return true;
    }
    return false;
  }

  function startGame(state, callbacks) {
    if (!state || state.phase !== 'title') return false;
    if (callbacks && typeof callbacks.onStart === 'function') {
      callbacks.onStart();
      return true;
    }
    if (typeof emberStartRound === 'function') {
      emberStartRound(state);
    } else {
      state.phase = 'playing';
    }
    return true;
  }

  function restartGame(state, callbacks) {
    if (callbacks && typeof callbacks.onRestart === 'function') {
      callbacks.onRestart();
      return true;
    }
    if (typeof newEmberGame === 'function') {
      var fresh = newEmberGame(state.seed || 1);
      Object.keys(state).forEach(function (k) { delete state[k]; });
      Object.assign(state, fresh);
      return true;
    }
    return false;
  }

  function toggleSound(callbacks) {
    if (callbacks && typeof callbacks.onToggleSound === 'function') {
      callbacks.onToggleSound();
      return;
    }
    if (typeof window !== 'undefined') {
      window.__emberSoundOn = window.__emberSoundOn === false;
    }
  }

  function emberBindInput(state, callbacks) {
    callbacks = callbacks || {};
    var canvas = document.getElementById('ember-court');
    if (!canvas || canvas.__emberInputBound) return;
    canvas.__emberInputBound = true;

    // Mouse: a click on a player-hand card plays it; a click anywhere
    // on the title screen starts the game.
    canvas.addEventListener('click', function (event) {
      var s = currentState(state, callbacks);
      if (!s) return;
      if (s.phase === 'title') { startGame(s, callbacks); return; }
      if (s.phase !== 'playing' || s.turn !== 'player') return;
      var rect = canvas.getBoundingClientRect();
      var scaleX = canvas.width / rect.width;
      var scaleY = canvas.height / rect.height;
      var x = (event.clientX - rect.left) * scaleX;
      var y = (event.clientY - rect.top) * scaleY;
      var rects = handRects(s);
      for (var i = 0; i < rects.length; i++) {
        var r = rects[i];
        if (x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) {
          playCard(s, callbacks, r.index);
          return;
        }
      }
    });

    // Keyboard: 1-5 play a hand card, Enter/Space starts, R restarts,
    // M toggles sound. R works from any phase; Enter/Space only from title.
    document.addEventListener('keydown', function (event) {
      var s = currentState(state, callbacks);
      if (!s) return;
      var key = event.key;
      if (key === 'r' || key === 'R') {
        restartGame(s, callbacks);
        return;
      }
      if (key === 'm' || key === 'M') {
        toggleSound(callbacks);
        return;
      }
      if (key === 'Enter' || key === ' ') {
        if (s.phase === 'title') {
          event.preventDefault();
          startGame(s, callbacks);
        }
        return;
      }
      if (s.phase === 'playing' && s.turn === 'player' &&
          key >= '1' && key <= '5') {
        playCard(s, callbacks, parseInt(key, 10) - 1);
      }
    });
  }

  window.emberBindInput = emberBindInput;
})();
