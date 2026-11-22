// Ember Court — shots.js
// Deterministic screenshot / demo states, driven by the URL:
//   ?shot=start|play|win|lose&seed=1
// emberApplyShot(state) mutates the state in place and is called from
// main.js before the first render. With no ?shot=, it leaves the state
// alone and sets window.__emberShot to null.

(function () {
  'use strict';

  function readShot() {
    try {
      return new URLSearchParams(window.location.search).get('shot');
    } catch (e) {
      return null;
    }
  }

  // Take up to `count` cards from the front of a deck, in deck order,
  // so the same seed always yields the same table.
  function dealFrom(deck, count) {
    var out = [];
    if (!deck) return out;
    for (var i = 0; i < count && deck.length; i++) out.push(deck.shift());
    return out;
  }

  // Make sure a hand holds exactly 5 cards, topping up from its deck.
  function topUpHand(state, who) {
    var hand = who === 'player' ? state.playerHand : state.aiHand;
    var deck = who === 'player' ? state.playerDeck : state.aiDeck;
    if (!hand || !deck) return;
    while (hand.length < 5 && deck.length) hand.push(deck.shift());
    if (hand.length > 5) hand.length = 5;
  }

  function emberApplyShot(state) {
    var shot = readShot();
    window.__emberShot = shot || null;
    if (!shot || !state) return;

    if (shot === 'start') {
      // Title over a dealt table: hands visible, life 30/30.
      state.phase = 'title';
      state.round = 1;
      state.turn = 'player';
      state.playerLife = 30;
      state.aiLife = 30;
      state.playerMana = 3;
      state.aiMana = 3;
      state.lastChain = null;
      state.winner = null;
      topUpHand(state, 'player');
      topUpHand(state, 'ai');
      state.playerTable = [];
      state.aiTable = [];
      state.log = ['Welcome to Ember Court.', 'Reduce the rival\u2019s 30 life to 0.'];
      return;
    }

    if (shot === 'play') {
      // Mid-game: 2 cards on each table, 5-card hands, lives 24 vs 19,
      // mana 4, a Flame chain, and a 3-line log. Deterministic: the
      // table cards come from the front of each seeded deck.
      state.phase = 'playing';
      state.round = 2;
      state.turn = 'player';
      state.playerLife = 24;
      state.aiLife = 19;
      state.playerMana = 4;
      state.aiMana = 4;
      state.lastChain = { suit: 'Flame', bonus: 2 };
      state.winner = null;
      topUpHand(state, 'player');
      topUpHand(state, 'ai');
      state.playerTable = dealFrom(state.playerDeck, 2);
      state.aiTable = dealFrom(state.aiDeck, 2);
      topUpHand(state, 'player');
      topUpHand(state, 'ai');
      state.log = [
        'Round 2 \u2014 you struck for 4.',
        'Rival answered for 3.',
        'Flame chain! +2 bonus damage.'
      ];
      return;
    }

    if (shot === 'win') {
      // Played-out endgame: round 3, 2 cards on each table dealt
      // deterministically from the seeded decks (same approach as
      // the play shot), hands refilled to 5, You 30 — Rival 0.
      state.phase = 'won';
      state.winner = 'player';
      state.round = 3;
      state.turn = 'player';
      state.playerLife = 30;
      state.aiLife = 0;
      state.playerMana = 5;
      state.aiMana = 5;
      state.lastChain = null;
      topUpHand(state, 'player');
      topUpHand(state, 'ai');
      state.playerTable = dealFrom(state.playerDeck, 2);
      state.aiTable = dealFrom(state.aiDeck, 2);
      topUpHand(state, 'player');
      topUpHand(state, 'ai');
      state.log = [
        'Round 3 \u2014 you struck for 6.',
        'The rival court falls. You win the Ember Court!'
      ];
      return;
    }

    if (shot === 'lose') {
      // Played-out endgame: round 3, 2 cards on each table dealt
      // deterministically from the seeded decks (same approach as
      // the play shot), hands refilled to 5, You 0 — Rival 30.
      state.phase = 'lost';
      state.winner = 'ai';
      state.round = 3;
      state.turn = 'player';
      state.playerLife = 0;
      state.aiLife = 30;
      state.playerMana = 5;
      state.aiMana = 5;
      state.lastChain = null;
      topUpHand(state, 'player');
      topUpHand(state, 'ai');
      state.playerTable = dealFrom(state.playerDeck, 2);
      state.aiTable = dealFrom(state.aiDeck, 2);
      topUpHand(state, 'player');
      topUpHand(state, 'ai');
      state.log = [
        'Round 3 \u2014 the rival struck for 6.',
        'Your court falls. The rival wins the Ember Court.'
      ];
      return;
    }

    // Unknown shot name: leave the state alone, but keep the name
    // visible so a bad link is easy to spot.
    window.__emberShot = shot;
  }

  window.emberApplyShot = emberApplyShot;
})();
