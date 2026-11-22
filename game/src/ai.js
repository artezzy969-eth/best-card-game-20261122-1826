// Ember Court — the rival court AI.
// A greedy courtier: it plays its hardest affordable hit, and prefers
// a card that chains with the suit already on its side of the table.

// Pick the AI's next card. Among the cards it can afford, take the
// highest attack; a suit that matches the last card on the AI table
// earns the +2 chain bonus, so those cards are considered first.
// Returns a hand index, or -1 when nothing is affordable.
function emberAiChoose(state) {
  const hand = state.aiHand;
  const mana = state.aiMana;
  const table = state.aiTable;
  const lastSuit = table.length > 0 ? table[table.length - 1].suit : null;

  let bestIndex = -1;
  let bestAttack = -1;
  let bestCost = Infinity;
  // First pass: only cards that chain with the table's last suit.
  if (lastSuit !== null) {
    for (let i = 0; i < hand.length; i++) {
      const card = hand[i];
      if (card.suit !== lastSuit) continue;
      if (card.cost > mana) continue;
      if (card.attack > bestAttack || (card.attack === bestAttack && card.cost < bestCost)) {
        bestIndex = i;
        bestAttack = card.attack;
        bestCost = card.cost;
      }
    }
    if (bestIndex !== -1) return bestIndex;
  }

  // Second pass: any affordable card, highest attack wins, and the
  // cheaper card breaks a tie so mana is not wasted.
  bestAttack = -1;
  bestCost = Infinity;
  for (let i = 0; i < hand.length; i++) {
    const card = hand[i];
    if (card.cost > mana) continue;
    if (card.attack > bestAttack || (card.attack === bestAttack && card.cost < bestCost)) {
      bestIndex = i;
      bestAttack = card.attack;
      bestCost = card.cost;
    }
  }
  return bestIndex;
}

// Take the AI's turn: choose a card and play it. Returns true when
// the AI played a card, false when it had no affordable card (or it
// was not the AI's turn).
function emberAiTakeTurn(state) {
  if (state.turn !== 'ai') return false;
  const index = emberAiChoose(state);
  if (index === -1) return false;
  return emberPlayCard(state, 'ai', index);
}
