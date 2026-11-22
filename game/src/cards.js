// Ember Court — deck building and turn rules.
// Everything here is deterministic: the same seed always deals the
// same deck and the same hands, so a game can be replayed exactly.

// Small seeded generator (mulberry32 style). Returns a function that
// yields a fresh pseudo-random number in [0, 1) on every call.
function emberRng(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Original fantasy-court names, grouped by suit. Each suit has five
// names so a 40-card deck (ten per suit) can cycle through them.
const EMBER_CARD_NAMES = {
  Flame: ['Ember Fox', 'Cinder Herald', 'Pyre Dancer', 'Ashen Knight', 'Bonfire Bard'],
  Tide: ['Moonlit Eel', 'Harbour Witch', 'Pearl Duelist', 'Raincaller', 'Deepcurrent Spy'],
  Thorn: ['Briar Duchess', 'Vine Assassin', 'Rosewarden', 'Thicket Scout', 'Nettle Jester'],
  Stone: ['Granite Warden', 'Pebble Sage', 'Quarry Giant', 'Marble Envoy', 'Cliff Falcon']
};

// Build a shuffled 40-card deck from a seed: ten cards per suit,
// each with a cost of 1-5 Ember and an attack of 1-9.
function buildEmberDeck(seed) {
  const rng = emberRng(seed);
  const deck = [];
  const suits = EMBER_CONFIG.SUITS;
  for (let s = 0; s < suits.length; s++) {
    const suit = suits[s];
    const names = EMBER_CARD_NAMES[suit];
    for (let n = 0; n < 10; n++) {
      deck.push({
        id: suit.toLowerCase() + '-' + (n + 1),
        name: names[n % names.length],
        suit: suit,
        cost: 1 + Math.floor(rng() * 5),
        attack: 1 + Math.floor(rng() * 9)
      });
    }
  }
  // Fisher-Yates shuffle, driven by the same seeded generator.
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = deck[i];
    deck[i] = deck[j];
    deck[j] = tmp;
  }
  return deck;
}

// Draw the top card of a deck pile into a hand, if any card is left.
function emberDrawCard(deck, hand) {
  if (deck.length === 0) return null;
  const card = deck.shift();
  hand.push(card);
  return card;
}

// Mana available at the start of a round: it grows by one each round,
// up to the configured cap.
function emberManaForRound(round) {
  return Math.min(EMBER_CONFIG.MANA_START + round - 1, EMBER_CONFIG.MANA_MAX);
}

// Create a fresh game. One 40-card deck is dealt out: five cards to
// each hand and the rest split evenly between the two draw piles.
function newEmberGame(seed) {
  const useSeed = (seed === undefined || seed === null) ? EMBER_CONFIG.SEED_DEFAULT : seed;
  const deck = buildEmberDeck(useSeed);
  const state = {
    phase: 'title',
    round: 1,
    turn: 'player',
    playerLife: EMBER_CONFIG.LIFE,
    aiLife: EMBER_CONFIG.LIFE,
    playerMana: EMBER_CONFIG.MANA_START,
    aiMana: EMBER_CONFIG.MANA_START,
    playerHand: [],
    aiHand: [],
    playerTable: [],
    aiTable: [],
    playerDeck: deck.slice(0, 20),
    aiDeck: deck.slice(20, 40),
    log: [],
    lastChain: null,
    seed: useSeed,
    winner: null,
    turnCount: 0
  };
  for (let i = 0; i < EMBER_CONFIG.HAND_SIZE; i++) {
    emberDrawCard(state.playerDeck, state.playerHand);
    emberDrawCard(state.aiDeck, state.aiHand);
  }
  state.log.push('Ember Court begins. Both courts hold ' + EMBER_CONFIG.LIFE + ' life.');
  return state;
}

// Can this side play this hand card right now? The game must be in
// its playing phase, it must be that side's turn, the card must exist,
// and its Ember cost must fit the side's remaining mana.
function emberCanPlay(state, who, handIndex) {
  if (state.phase !== 'playing') return false;
  if (state.turn !== who) return false;
  const hand = who === 'player' ? state.playerHand : state.aiHand;
  if (handIndex < 0 || handIndex >= hand.length) return false;
  const mana = who === 'player' ? state.playerMana : state.aiMana;
  return hand[handIndex].cost <= mana;
}

// Finish a game that ended on life: set the phase and the winner.
function emberEndOnLife(state) {
  if (state.playerLife <= 0 && state.aiLife <= 0) {
    state.phase = 'draw';
    state.winner = 'draw';
    state.log.push('Both courts fall at once. The match is a draw.');
  } else if (state.aiLife <= 0) {
    state.phase = 'won';
    state.winner = 'player';
    state.log.push('The rival court falls. You win the Ember Court!');
  } else if (state.playerLife <= 0) {
    state.phase = 'lost';
    state.winner = 'ai';
    state.log.push('Your court falls. The rival wins the Ember Court.');
  }
}

// Finish a game that ran out of rounds: higher life takes the match.
function emberEndOnRounds(state) {
  if (state.playerLife > state.aiLife) {
    state.phase = 'won';
    state.winner = 'player';
    state.log.push('Three rounds are done. You win ' + state.playerLife + ' to ' + state.aiLife + '!');
  } else if (state.aiLife > state.playerLife) {
    state.phase = 'lost';
    state.winner = 'ai';
    state.log.push('Three rounds are done. The rival wins ' + state.aiLife + ' to ' + state.playerLife + '.');
  } else {
    state.phase = 'draw';
    state.winner = 'draw';
    state.log.push('Three rounds are done. The match ends tied ' + state.playerLife + ' to ' + state.aiLife + '.');
  }
}

// Play a card from a hand onto that side's table. A card whose suit
// matches the last card on the same side's table chains for +2 attack.
// Returns true when the card was played, false when it could not be.
function emberPlayCard(state, who, handIndex) {
  if (!emberCanPlay(state, who, handIndex)) return false;
  const isPlayer = who === 'player';
  const hand = isPlayer ? state.playerHand : state.aiHand;
  const table = isPlayer ? state.playerTable : state.aiTable;
  const deck = isPlayer ? state.playerDeck : state.aiDeck;
  const label = isPlayer ? 'You' : 'Rival';

  const card = hand.splice(handIndex, 1)[0];
  if (isPlayer) {
    state.playerMana -= card.cost;
  } else {
    state.aiMana -= card.cost;
  }
  table.push(card);

  // Chain check: compare against the card played just before this one
  // on the same side of the table.
  let damage = card.attack;
  const previous = table.length >= 2 ? table[table.length - 2] : null;
  if (previous && previous.suit === card.suit) {
    damage += 2;
    state.lastChain = { suit: card.suit, bonus: 2 };
  } else {
    state.lastChain = null;
  }

  if (isPlayer) {
    state.aiLife -= damage;
  } else {
    state.playerLife -= damage;
  }
  state.turnCount += 1;

  let line = label + ' play' + (isPlayer ? '' : 's') + ' ' + card.name + ' (' + card.suit + ') for ' + damage + ' damage.';
  if (state.lastChain) {
    line += ' Chain bonus +2!';
  }
  state.log.push(line);

  // Draw a replacement card so the hand stays full while the deck lasts.
  emberDrawCard(deck, hand);

  // A court reduced to 0 life loses at once.
  if (state.playerLife <= 0 || state.aiLife <= 0) {
    emberEndOnLife(state);
    return true;
  }

  // Hand the turn over. When the turn comes back to the player the
  // AI has had its turn, so a full round is complete.
  if (isPlayer) {
    state.turn = 'ai';
    return true;
  }
  state.turn = 'player';
  if (state.round >= EMBER_CONFIG.MAX_ROUNDS) {
    emberEndOnRounds(state);
    return true;
  }
  state.round += 1;
  const mana = emberManaForRound(state.round);
  state.playerMana = mana;
  state.aiMana = mana;
  state.log.push('Round ' + state.round + ' begins. Mana refills to ' + mana + '.');
  return true;
}

// Start (or restart) a round: clear both tables, top both hands back
// up to five cards, and refill both sides' mana for this round.
function emberStartRound(state) {
  state.playerTable = [];
  state.aiTable = [];
  state.lastChain = null;
  const mana = emberManaForRound(state.round);
  state.playerMana = mana;
  state.aiMana = mana;
  while (state.playerHand.length < EMBER_CONFIG.HAND_SIZE) {
    if (!emberDrawCard(state.playerDeck, state.playerHand)) break;
  }
  while (state.aiHand.length < EMBER_CONFIG.HAND_SIZE) {
    if (!emberDrawCard(state.aiDeck, state.aiHand)) break;
  }
  if (state.phase === 'title') {
    state.phase = 'playing';
  }
  state.log.push('Round ' + state.round + ' starts. Tables cleared, hands refilled, mana at ' + mana + '.');
  return state;
}
