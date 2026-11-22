// Ember Court — render.js
// Draws the whole game on the 1280x800 canvas. Classic script, no modules.
// Expects the shared contract: EMBER_CONFIG, and a state object from
// newEmberGame(seed). Stores player-hand hit rects in state._hit and in
// window.__emberHandRects so input.js can hit-test clicks.

(function () {
  'use strict';

  var W = 1280;
  var H = 800;
  var CARD_W = 150;
  var CARD_H = 210;

  // Suit look: colour AND symbol, so a suit is readable in two ways.
  function suitInfo(suit) {
    if (suit === 'Flame') return { color: '#d9382b', symbol: '\u25B2' };
    if (suit === 'Tide') return { color: '#2b6fd9', symbol: '\u25CF' };
    if (suit === 'Thorn') return { color: '#2e9e4f', symbol: '\u25C6' };
    if (suit === 'Stone') return { color: '#6b7280', symbol: '\u25A0' };
    return { color: '#333333', symbol: '?' };
  }

  function lifeOf(state) {
    return {
      player: typeof state.playerLife === 'number' ? state.playerLife : 30,
      ai: typeof state.aiLife === 'number' ? state.aiLife : 30
    };
  }

  function drawTable(ctx) {
    // Green felt with a gold border and a soft centre glow.
    var grad = ctx.createRadialGradient(640, 400, 80, 640, 400, 700);
    grad.addColorStop(0, '#2e7d46');
    grad.addColorStop(1, '#175c2e');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = '#d4af37';
    ctx.lineWidth = 10;
    ctx.strokeRect(14, 14, W - 28, H - 28);
    ctx.strokeStyle = 'rgba(212,175,55,0.45)';
    ctx.lineWidth = 2;
    ctx.strokeRect(30, 30, W - 60, H - 60);
    // Faint centre emblem.
    ctx.fillStyle = 'rgba(255,255,255,0.06)';
    ctx.font = 'bold 120px Georgia, serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('\u25B2', 640, 400);
  }

  // Greedy word-wrap measured with the live canvas font, so text is
  // only split where it truly fits inside maxWidth. Returns at most
  // maxLines lines; a single over-long word is hard-split, and any
  // overflow past the last line is refitted with an ellipsis.
  function wrapMeasured(ctx, text, maxWidth, maxLines) {
    var words = String(text || '').split(/\s+/).filter(Boolean);
    var lines = [];
    var cur = '';
    function pushCur() { if (cur) { lines.push(cur); cur = ''; } }
    for (var i = 0; i < words.length; i++) {
      var word = words[i];
      while (ctx.measureText(word).width > maxWidth && word.length > 1) {
        var cut = 1;
        while (cut < word.length && ctx.measureText(word.slice(0, cut + 1)).width <= maxWidth) cut++;
        pushCur();
        lines.push(word.slice(0, cut));
        word = word.slice(cut);
      }
      var trial = cur ? cur + ' ' + word : word;
      if (ctx.measureText(trial).width <= maxWidth) {
        cur = trial;
      } else {
        pushCur();
        cur = word;
      }
    }
    pushCur();
    if (lines.length <= maxLines) return lines.length ? lines : [''];
    var kept = lines.slice(0, maxLines);
    var fitted = kept[maxLines - 1];
    while (fitted.length > 1 && ctx.measureText(fitted + ' \u2026').width > maxWidth) {
      fitted = fitted.slice(0, -1);
    }
    kept[maxLines - 1] = fitted + ' \u2026';
    return kept;
  }

  function drawCard(ctx, card, x, y, w, h, faceDown, dimmed) {
    ctx.save();
    if (dimmed) ctx.globalAlpha = 0.45;
    // Card body.
    ctx.fillStyle = faceDown ? '#7a1f1f' : '#fdf6e3';
    ctx.strokeStyle = faceDown ? '#d4af37' : '#3a2a18';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, 12);
    ctx.fill();
    ctx.stroke();
    if (faceDown) {
      // Card back: gold frame with a flame mark.
      ctx.strokeStyle = '#d4af37';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.roundRect(x + 10, y + 10, w - 20, h - 20, 8);
      ctx.stroke();
      ctx.fillStyle = '#d4af37';
      ctx.font = 'bold ' + Math.round(44 * w / CARD_W) + 'px Georgia, serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('\u25B2', x + w / 2, y + h / 2);
      ctx.restore();
      return;
    }
    if (!card) { ctx.restore(); return; }
    var info = suitInfo(card.suit);
    // Scale every inner measurement with the card size, so the smaller
    // table cards stay readable and nothing overflows their frame.
    var s = w / CARD_W;
    // Cost badge, top left.
    ctx.fillStyle = '#1f3a5f';
    ctx.beginPath();
    ctx.arc(x + 26 * s, y + 26 * s, 20 * s, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold ' + Math.round(24 * s) + 'px Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(card.cost), x + 26 * s, y + 27 * s);
    // Suit symbol, big and centred, kept high so the name zone below
    // it has a clear run.
    ctx.fillStyle = info.color;
    ctx.font = 'bold ' + Math.round(56 * s) + 'px Georgia, serif';
    ctx.fillText(info.symbol, x + w / 2, y + 74 * s);
    // Suit name.
    ctx.font = 'bold ' + Math.round(19 * s) + 'px Arial, sans-serif';
    ctx.fillText(String(card.suit).toUpperCase(), x + w / 2, y + 114 * s);
    // Thin rule separating the suit from the name zone.
    ctx.strokeStyle = 'rgba(58,42,24,0.35)';
    ctx.lineWidth = 1.5 * s;
    ctx.beginPath();
    ctx.moveTo(x + 16 * s, y + 126 * s);
    ctx.lineTo(x + w - 16 * s, y + 126 * s);
    ctx.stroke();
    // Card name: measured wrap over at most two lines in a dedicated
    // band (baselines 144s / 162s), with 14s padding on each side.
    // The font shrinks from 17s until both lines fit, so long names
    // like "Vine Assassin" and "Deepcurrent Spy" stay inside the
    // card instead of running to the edge.
    ctx.fillStyle = '#222222';
    var name = String(card.name || '');
    var nameMaxW = w - 28 * s;
    var nameLines = [];
    var nameSize = 17;
    while (nameSize >= 12) {
      ctx.font = 'bold ' + Math.round(nameSize * s) + 'px Arial, sans-serif';
      nameLines = wrapMeasured(ctx, name, nameMaxW, 2);
      var widest = 0;
      for (var li = 0; li < nameLines.length; li++) {
        widest = Math.max(widest, ctx.measureText(nameLines[li]).width);
      }
      if (widest <= nameMaxW) break;
      nameSize -= 1;
    }
    ctx.font = 'bold ' + Math.round(nameSize * s) + 'px Arial, sans-serif';
    if (nameLines.length === 1) {
      ctx.fillText(nameLines[0], x + w / 2, y + 153 * s);
    } else {
      ctx.fillText(nameLines[0], x + w / 2, y + 144 * s);
      ctx.fillText(nameLines[1], x + w / 2, y + 162 * s);
    }
    // Attack badge, bottom-right corner, smaller and tucked into the
    // corner: its top edge sits at h-41s, below the name band
    // (which ends at ~166s), so it can never cover a name.
    ctx.fillStyle = '#7a1f1f';
    ctx.beginPath();
    ctx.arc(x + w - 24 * s, y + h - 24 * s, 17 * s, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold ' + Math.round(22 * s) + 'px Arial, sans-serif';
    ctx.fillText(String(card.attack), x + w - 24 * s, y + h - 23 * s);
    ctx.restore();
  }

  // w/h are parameters: the rival hand and table rows use smaller cards
  // so everything fits in 800px; only the player hand is full size.
  function drawHandRow(ctx, hand, y, faceDown, state, forPlayer, w, h) {
    w = w || CARD_W;
    h = h || CARD_H;
    var n = hand ? hand.length : 0;
    if (!n) return;
    var gap = 12;
    var total = n * w + (n - 1) * gap;
    var startX = (W - total) / 2;
    for (var i = 0; i < n; i++) {
      var x = startX + i * (w + gap);
      var dimmed = false;
      if (forPlayer && state && state.phase === 'playing' && state.turn === 'player') {
        // Dim cards the player cannot afford right now.
        if (typeof emberCanPlay === 'function') {
          try { dimmed = !emberCanPlay(state, 'player', i); } catch (e) { dimmed = false; }
        } else if (typeof hand[i].cost === 'number') {
          dimmed = hand[i].cost > (state.playerMana || 0);
        }
      }
      drawCard(ctx, hand[i], x, y, w, h, faceDown, dimmed);
      if (forPlayer) {
        // Remember the rect for click hit-testing in input.js.
        if (!state._hit) state._hit = [];
        state._hit[i] = { x: x, y: y, w: w, h: h, index: i };
      }
    }
  }

  function drawTableRow(ctx, cards, y, label) {
    ctx.fillStyle = 'rgba(255,255,255,0.75)';
    ctx.font = 'bold 16px Arial, sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(label, 48, y - 8);
    if (!cards || !cards.length) return;
    var w = 96;
    var h = 134;
    var gap = 10;
    var total = cards.length * w + (cards.length - 1) * gap;
    var startX = (W - total) / 2;
    for (var i = 0; i < cards.length; i++) {
      drawCard(ctx, cards[i], startX + i * (w + gap), y, w, h, false, false);
    }
  }

  function drawLifeBar(ctx, x, y, label, life, maxLife, alignRight) {
    var barW = 220;
    var barX = alignRight ? x - barW : x;
    ctx.textAlign = alignRight ? 'right' : 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 22px Arial, sans-serif';
    ctx.fillText(label, alignRight ? x : x, y);
    // Big life number with a heart.
    ctx.font = 'bold 40px Arial, sans-serif';
    ctx.fillStyle = '#ff5a5a';
    var heartX = alignRight ? barX - 44 : barX + barW + 14;
    ctx.textAlign = 'left';
    ctx.fillText('\u2665 ' + life, heartX, y + 2);
    // Bar under the label.
    var frac = Math.max(0, Math.min(1, life / maxLife));
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ctx.fillRect(barX, y + 12, barW, 16);
    ctx.fillStyle = frac > 0.5 ? '#4caf50' : (frac > 0.25 ? '#ff9800' : '#e53935');
    ctx.fillRect(barX, y + 12, Math.round(barW * frac), 16);
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.strokeRect(barX, y + 12, barW, 16);
  }

  function drawManaPips(ctx, x, y, mana, maxMana, label) {
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 18px Arial, sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(label, x, y);
    for (var i = 0; i < maxMana; i++) {
      ctx.beginPath();
      ctx.arc(x + 62 + i * 26, y - 6, 9, 0, Math.PI * 2);
      ctx.fillStyle = i < mana ? '#4fc3f7' : 'rgba(255,255,255,0.25)';
      ctx.fill();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }
  }

  function drawHud(ctx, state) {
    var cfg = (typeof EMBER_CONFIG !== 'undefined') ? EMBER_CONFIG : {};
    var maxLife = cfg.LIFE || 30;
    var maxMana = cfg.MANA_MAX || 7;
    var life = lifeOf(state);
    // Top bar: rival on the left, round in the middle, player on the right.
    drawLifeBar(ctx, 48, 44, 'RIVAL', life.ai, maxLife, false);
    drawManaPips(ctx, 48, 88, state.aiMana || 0, maxMana, 'MANA');
    drawLifeBar(ctx, 1232, 44, 'YOU', life.player, maxLife, true);
    drawManaPips(ctx, 1232 - 236, 88, state.playerMana || 0, maxMana, 'MANA');
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 26px Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('ROUND ' + (state.round || 1) + ' / ' + (cfg.MAX_ROUNDS || 3), 640, 44);
    ctx.font = 'bold 18px Arial, sans-serif';
    var turnText = state.phase === 'playing'
      ? (state.turn === 'player' ? 'Your turn — play a card' : 'Rival is thinking…')
      : '';
    ctx.fillStyle = '#ffe082';
    ctx.fillText(turnText, 640, 72);
    // Deck counts, at the table edges.
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.font = 'bold 17px Arial, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('Rival deck: ' + (state.aiDeck ? state.aiDeck.length : 0), 48, 400);
    ctx.textAlign = 'right';
    ctx.fillText('Your deck: ' + (state.playerDeck ? state.playerDeck.length : 0), 1232, 400);
    // Chain bonus, central, in the narrow gap between the player
    // table (ends 500) and the player hand (starts 528): a smaller
    // 22px line at y 521, clear of both rows.
    if (state.lastChain) {
      ctx.fillStyle = '#ffd54f';
      ctx.font = 'bold 22px Arial, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('+2 CHAIN!  ' + String(state.lastChain.suit).toUpperCase(), 640, 521);
    }
    // Scrolling log: last 3 entries, each word-wrapped onto up to 3
    // lines at 13px so the full text stays readable. It lives in the
    // left margin beside the player hand (the hand is centred, so
    // that strip is free) and is never truncated mid-word.
    var log = state.log || [];
    var logEntries = log.slice(-3);
    var logWrapped = [];
    ctx.font = '13px Arial, sans-serif';
    for (var li = 0; li < logEntries.length; li++) {
      var wrapped = wrapMeasured(ctx, String(logEntries[li]), 192, 3);
      for (var wi = 0; wi < wrapped.length; wi++) logWrapped.push(wrapped[wi]);
    }
    // Cap the block at the last 8 visual lines if a long entry overflows.
    if (logWrapped.length > 8) logWrapped = logWrapped.slice(logWrapped.length - 8);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    for (var i = 0; i < logWrapped.length; i++) {
      ctx.fillStyle = 'rgba(0,0,0,0.45)';
      ctx.fillRect(40, 556 + i * 17 - 13, 200, 15);
      ctx.fillStyle = '#ffffff';
      ctx.fillText(logWrapped[i], 44, 556 + i * 17);
    }
  }

  function drawOverlay(ctx, title, lines, hint) {
    ctx.fillStyle = 'rgba(10,20,14,0.78)';
    ctx.fillRect(0, 0, W, H);
    var panelW = 860;
    var panelH = 380;
    var px = (W - panelW) / 2;
    var py = (H - panelH) / 2;
    ctx.fillStyle = 'rgba(20,40,28,0.95)';
    ctx.strokeStyle = '#d4af37';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.roundRect(px, py, panelW, panelH, 16);
    ctx.fill();
    ctx.stroke();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = '#ffd54f';
    ctx.font = 'bold 72px Georgia, serif';
    ctx.fillText(title, 640, py + 108);
    ctx.fillStyle = '#ffffff';
    ctx.font = '26px Arial, sans-serif';
    for (var i = 0; i < lines.length; i++) {
      ctx.fillText(lines[i], 640, py + 168 + i * 40);
    }
    ctx.fillStyle = '#ffe082';
    ctx.font = 'bold 26px Arial, sans-serif';
    ctx.fillText(hint, 640, py + panelH - 44);
  }

  // Control hints live in their own band below the player hand
  // (the hand ends at 738), never drawn over any card.
  function drawFooterHint(ctx) {
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(30, 748, W - 60, 40);
    ctx.fillStyle = '#ffe082';
    ctx.font = 'bold 18px Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText('Keys 1\u20135 play a card  \u00B7  M sound  \u00B7  R restart', W / 2, 774);
  }

  // Main entry point. Draws the live table first, then any phase overlay.
  function emberRender(state) {
    var canvas = document.getElementById('ember-court');
    if (!canvas) return;
    var ctx = canvas.getContext('2d');
    if (!ctx) return;
    if (!state) return;
    state._hit = [];
    window.__emberHandRects = state._hit;

    drawTable(ctx);
    // A real game state sits behind every overlay, so the title and end
    // screens show the dealt table, both hands and both life totals.
    drawHandRow(ctx, state.aiHand, 78, true, state, false, 90, 126);
    drawTableRow(ctx, state.aiTable, 218, 'RIVAL TABLE');
    drawTableRow(ctx, state.playerTable, 366, 'YOUR TABLE');
    drawHandRow(ctx, state.playerHand, 528, false, state, true);
    drawHud(ctx, state);

    if (state.phase === 'title') {
      drawOverlay(ctx, 'EMBER COURT', [
        'A tactical card battler \u2014 reduce the rival\u2019s 30 life to 0',
        'Play cards, chain matching suits for +2, win 2 of 3 rounds.'
      ], 'Click or press Enter to begin');
    } else if (state.phase === 'won' || state.phase === 'lost') {
      var life = lifeOf(state);
      if (state.phase === 'won') {
        drawOverlay(ctx, 'VICTORY', [
          'The Court is yours.',
          'You ' + life.player + '  \u2014  Rival ' + life.ai
        ], 'Press R to play again');
      } else {
        drawOverlay(ctx, 'DEFEAT', [
          'The rival keeps the Court.',
          'You ' + life.player + '  \u2014  Rival ' + life.ai
        ], 'Press R to play again');
      }
    }
    // Footer band last, so it stays readable over every phase.
    drawFooterHint(ctx);
  }

  window.emberRender = emberRender;
})();
