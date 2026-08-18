/**
 * Tjapza - Capsa Banting (Big Two) Rules Engine & Bot AI
 * Compatible with Goja ES5 environment.
 */

var SUIT_DIAMOND = 0; // ♦
var SUIT_CLUB = 1;    // ♣
var SUIT_HEART = 2;   // ♥
var SUIT_SPADE = 3;   // ♠

// Game Timing Constants
var TURN_TIMEOUT_SECS = 60; // 60s human turn timer
var TURN_TIMEOUT_MS = TURN_TIMEOUT_SECS * 1000; // 60,000 ms
var PUBLIC_LOBBY_AUTOSTART_SECS = 30; // 30s public lobby auto-fill countdown
var PUBLIC_LOBBY_AUTOSTART_MS = PUBLIC_LOBBY_AUTOSTART_SECS * 1000; // 30,000 ms

// Rank 0 = 3, 1 = 4, ..., 8 = J, 9 = Q, 10 = K, 11 = A, 12 = 2
var RANK_NAMES = ["3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K", "A", "2"];
var SUIT_SYMBOLS = ["♦", "♣", "♥", "♠"];

function cardRank(card) {
    return Math.floor(card / 4);
}

function cardSuit(card) {
    return card % 4;
}

function cardCode(rank, suit) {
    return rank * 4 + suit;
}

function cardName(card) {
    return RANK_NAMES[cardRank(card)] + SUIT_SYMBOLS[cardSuit(card)];
}

function createDeck() {
    var deck = [];
    for (var i = 0; i < 52; i++) {
        deck.push(i);
    }
    return deck;
}

function shuffleDeck(deck) {
    var arr = deck.slice();
    for (var i = arr.length - 1; i > 0; i--) {
        var j = Math.floor(Math.random() * (i + 1));
        var temp = arr[i];
        arr[i] = arr[j];
        arr[j] = temp;
    }
    return arr;
}

function sortCards(cards) {
    return cards.slice().sort(function(a, b) {
        return a - b;
    });
}

// 10 Valid Straights in ascending power order (0..9)
// Each entry defines: ranks in straight, and top determining rank for comparison
var VALID_STRAIGHTS = [
    { ranks: [11, 12, 0, 1, 2], topRank: 2 }, // 0: A-2-3-4-5 (top card is 5)
    { ranks: [0, 1, 2, 3, 4],   topRank: 4 }, // 1: 3-4-5-6-7 (top card is 7)
    { ranks: [1, 2, 3, 4, 5],   topRank: 5 }, // 2: 4-5-6-7-8 (top card is 8)
    { ranks: [2, 3, 4, 5, 6],   topRank: 6 }, // 3: 5-6-7-8-9 (top card is 9)
    { ranks: [3, 4, 5, 6, 7],   topRank: 7 }, // 4: 6-7-8-9-10 (top card is 10)
    { ranks: [4, 5, 6, 7, 8],   topRank: 8 }, // 5: 7-8-9-10-J (top card is J)
    { ranks: [5, 6, 7, 8, 9],   topRank: 9 }, // 6: 8-9-10-J-Q (top card is Q)
    { ranks: [6, 7, 8, 9, 10],  topRank: 10 },// 7: 9-10-J-Q-K (top card is K)
    { ranks: [7, 8, 9, 10, 11], topRank: 11 },// 8: 10-J-Q-K-A (top card is A)
    { ranks: [8, 9, 10, 11, 12], topRank: 12 } // 9: J-Q-K-A-2 (top card is 2)
];

function checkStraightPattern(sortedRanks) {
    for (var i = 0; i < VALID_STRAIGHTS.length; i++) {
        var pattern = VALID_STRAIGHTS[i].ranks.slice().sort(function(a, b) { return a - b; });
        var match = true;
        for (var j = 0; j < 5; j++) {
            if (sortedRanks[j] !== pattern[j]) {
                match = false;
                break;
            }
        }
        if (match) {
            return {
                index: i,
                topRank: VALID_STRAIGHTS[i].topRank
            };
        }
    }
    return null;
}

/**
 * Checks if a combo object is null, empty or missing type.
 */
function isComboEmpty(combo) {
    if (!combo) return true;
    if (Array.isArray(combo) && combo.length === 0) return true;
    if (typeof combo === "object" && (!combo.type || combo.type === "")) return true;
    return false;
}

/**
 * Evaluates a set of cards and returns the combo information if valid, or null.
 */
function evaluateCombo(cards) {
    if (!cards || !cards.length) return null;
    var len = cards.length;

    // Single (1 card)
    if (len === 1) {
        var c = cards[0];
        return {
            valid: true,
            type: "single",
            power: c,
            cards: [c]
        };
    }

    // Pair (2 cards)
    if (len === 2) {
        var r0 = cardRank(cards[0]);
        var r1 = cardRank(cards[1]);
        if (r0 === r1) {
            var highestCard = Math.max(cards[0], cards[1]);
            return {
                valid: true,
                type: "pair",
                power: highestCard,
                cards: sortCards(cards)
            };
        }
        return null;
    }

    // 5-Card Combos
    if (len === 5) {
        var sorted = sortCards(cards);
        var ranks = sorted.map(cardRank);
        var suits = sorted.map(cardSuit);
        var sortedRanks = ranks.slice().sort(function(a, b) { return a - b; });

        // Count rank occurrences
        var rankCounts = {};
        for (var i = 0; i < 5; i++) {
            var r = ranks[i];
            rankCounts[r] = (rankCounts[r] || 0) + 1;
        }
        var countKeys = Object.keys(rankCounts);
        var counts = countKeys.map(function(k) { return rankCounts[k]; }).sort(function(a, b) { return b - a; });

        var isFlush = (suits[0] === suits[1] && suits[1] === suits[2] && suits[2] === suits[3] && suits[3] === suits[4]);
        var straightInfo = checkStraightPattern(sortedRanks);

        // 1. Straight Flush
        if (isFlush && straightInfo !== null) {
            var topSuit = suits[0];
            var sfPower = 50000000 + straightInfo.index * 4 + topSuit;
            return {
                valid: true,
                type: "straight_flush",
                power: sfPower,
                cards: sorted
            };
        }

        // 2. Four of a Kind (Quads)
        if (counts[0] === 4) {
            var quadRank = 0;
            var kickerRank = 0;
            for (var k in rankCounts) {
                if (rankCounts[k] === 4) quadRank = parseInt(k, 10);
                else kickerRank = parseInt(k, 10);
            }
            var quadPower = 40000000 + quadRank * 100 + kickerRank;
            return {
                valid: true,
                type: "quads",
                power: quadPower,
                cards: sorted
            };
        }

        // 3. Full House (Triple + Pair)
        if (counts[0] === 3 && counts[1] === 2) {
            var tripleRank = 0;
            var pairRank = 0;
            for (var k2 in rankCounts) {
                if (rankCounts[k2] === 3) tripleRank = parseInt(k2, 10);
                else pairRank = parseInt(k2, 10);
            }
            var fhPower = 30000000 + tripleRank * 100 + pairRank;
            return {
                valid: true,
                type: "full_house",
                power: fhPower,
                cards: sorted
            };
        }

        // 4. Flush
        if (isFlush) {
            // Rank-first comparison. Sort ranks descending: r0 > r1 > r2 > r3 > r4
            var descRanks = sortedRanks.slice().reverse();
            var rankPoly = descRanks[0] * 28561 + descRanks[1] * 2197 + descRanks[2] * 169 + descRanks[3] * 13 + descRanks[4];
            var flushPower = 20000000 + rankPoly * 4 + suits[0];
            return {
                valid: true,
                type: "flush",
                power: flushPower,
                cards: sorted
            };
        }

        // 5. Straight
        if (straightInfo !== null) {
            // Find the card in the hand that has the topRank to get its suit
            var topSuit2 = 0;
            for (var m = 0; m < 5; m++) {
                if (cardRank(sorted[m]) === straightInfo.topRank) {
                    topSuit2 = cardSuit(sorted[m]);
                    break;
                }
            }
            var straightPower = 10000000 + straightInfo.index * 4 + topSuit2;
            return {
                valid: true,
                type: "straight",
                power: straightPower,
                cards: sorted
            };
        }

        return null;
    }

    return null;
}

var FIVE_CARD_TYPES = ["straight", "flush", "full_house", "quads", "straight_flush"];

function isFiveCardType(type) {
    return FIVE_CARD_TYPES.indexOf(type) !== -1;
}

/**
 * Checks whether a candidate combo can beat the current pile (lastCombo).
 */
function canBeat(candidateCombo, lastCombo) {
    if (!candidateCombo || !candidateCombo.valid) return false;
    if (isComboEmpty(lastCombo)) return true; // Leading free turn

    var cType = candidateCombo.type;
    var lType = lastCombo.type;

    if (lType === "single") {
        return cType === "single" && candidateCombo.power > lastCombo.power;
    }

    if (lType === "pair") {
        return cType === "pair" && candidateCombo.power > lastCombo.power;
    }

    if (isFiveCardType(lType)) {
        return isFiveCardType(cType) && candidateCombo.power > lastCombo.power;
    }

    return false;
}

// ----------------------------------------------------
// BOT AI HEURISTIC ENGINE
// ----------------------------------------------------

/**
 * Finds all possible combos from a hand.
 */
function findAllCombos(handCards) {
    var singles = [];
    var pairs = [];
    var straights = [];
    var flushes = [];
    var fullHouses = [];
    var quads = [];
    var straightFlushes = [];

    var n = handCards.length;

    // Singles
    for (var i = 0; i < n; i++) {
        var sCombo = evaluateCombo([handCards[i]]);
        if (sCombo) singles.push(sCombo);
    }

    // Pairs
    for (var i = 0; i < n; i++) {
        for (var j = i + 1; j < n; j++) {
            var pCombo = evaluateCombo([handCards[i], handCards[j]]);
            if (pCombo) pairs.push(pCombo);
        }
    }

    // 5-Card Combos
    if (n >= 5) {
        for (var i1 = 0; i1 < n - 4; i1++) {
            for (var i2 = i1 + 1; i2 < n - 3; i2++) {
                for (var i3 = i2 + 1; i3 < n - 2; i3++) {
                    for (var i4 = i3 + 1; i4 < n - 1; i4++) {
                        for (var i5 = i4 + 1; i5 < n; i5++) {
                            var five = [handCards[i1], handCards[i2], handCards[i3], handCards[i4], handCards[i5]];
                            var combo5 = evaluateCombo(five);
                            if (combo5) {
                                if (combo5.type === "straight_flush") straightFlushes.push(combo5);
                                else if (combo5.type === "quads") quads.push(combo5);
                                else if (combo5.type === "full_house") fullHouses.push(combo5);
                                else if (combo5.type === "flush") flushes.push(combo5);
                                else if (combo5.type === "straight") straights.push(combo5);
                            }
                        }
                    }
                }
            }
        }
    }

    return {
        singles: singles.sort(function(a, b) { return a.power - b.power; }),
        pairs: pairs.sort(function(a, b) { return a.power - b.power; }),
        straights: straights.sort(function(a, b) { return a.power - b.power; }),
        flushes: flushes.sort(function(a, b) { return a.power - b.power; }),
        fullHouses: fullHouses.sort(function(a, b) { return a.power - b.power; }),
        quads: quads.sort(function(a, b) { return a.power - b.power; }),
        straightFlushes: straightFlushes.sort(function(a, b) { return a.power - b.power; })
    };
}

/**
 * Decomposes a hand into a partition of non-overlapping combinations that minimizes
 * the total number of moves (turns) required to empty the hand.
 */
function decomposeHand(handCards) {
    if (!handCards || !handCards.length) return [];
    var sorted = sortCards(handCards);
    var bestPartition = [];
    var minTurns = 999;

    function search(remaining, current) {
        if (remaining.length === 0) {
            if (current.length < minTurns) {
                minTurns = current.length;
                bestPartition = current.slice();
            }
            return;
        }

        if (current.length + 1 >= minTurns && minTurns !== 999) {
            return;
        }

        var allCombos = findAllCombos(remaining);

        // 1. Try 5-card combos
        var fiveList = [].concat(allCombos.straights, allCombos.flushes, allCombos.fullHouses, allCombos.quads, allCombos.straightFlushes);
        for (var f = 0; f < fiveList.length; f++) {
            var combo = fiveList[f];
            var nextRem = [];
            for (var r = 0; r < remaining.length; r++) {
                if (combo.cards.indexOf(remaining[r]) === -1) {
                    nextRem.push(remaining[r]);
                }
            }
            search(nextRem, current.concat([combo]));
        }

        // 2. Try Pairs
        for (var p = 0; p < allCombos.pairs.length; p++) {
            var pair = allCombos.pairs[p];
            var nextRemP = [];
            for (var r2 = 0; r2 < remaining.length; r2++) {
                if (pair.cards.indexOf(remaining[r2]) === -1) {
                    nextRemP.push(remaining[r2]);
                }
            }
            search(nextRemP, current.concat([pair]));
        }

        // 3. Base fallback: All remaining as singles
        var fullPartition = current.concat(allCombos.singles);
        if (fullPartition.length < minTurns) {
            minTurns = fullPartition.length;
            bestPartition = fullPartition.slice();
        }
    }

    search(sorted, []);

    bestPartition.sort(function(a, b) {
        if (a.cards.length !== b.cards.length) {
            return b.cards.length - a.cards.length;
        }
        return a.power - b.power;
    });

    return bestPartition;
}

/**
 * Determines the bot's move given its hand and current game state.
 * Returns { action: 'play', cards: [...] } or { action: 'pass', cards: [] }.
 */
function getBotMove(handCards, lastCombo, isFirstMove, counts) {
    if (!handCards || !handCards.length) {
        return { action: "pass", cards: [] };
    }

    if (isComboEmpty(lastCombo)) {
        lastCombo = null;
    }

    var partition = decomposeHand(handCards);
    var all = findAllCombos(handCards);

    // If first move of game: MUST include 3♦ (card code 0)
    if (isFirstMove) {
        // Collect all combos containing card 0
        var validFirstMoves = [];
        var checkFirst = function(list) {
            for (var i = 0; i < list.length; i++) {
                if (list[i].cards.indexOf(0) !== -1) {
                    validFirstMoves.push(list[i]);
                }
            }
        };

        // Preference: 5-card combo > pair > single
        checkFirst(all.straightFlushes);
        checkFirst(all.quads);
        checkFirst(all.fullHouses);
        checkFirst(all.flushes);
        checkFirst(all.straights);
        if (validFirstMoves.length > 0) {
            return { action: "play", cards: validFirstMoves[0].cards };
        }

        checkFirst(all.pairs);
        if (validFirstMoves.length > 0) {
            return { action: "play", cards: validFirstMoves[0].cards };
        }

        return { action: "play", cards: [0] };
    }

    // If leading (lastCombo is null)
    if (!lastCombo) {
        if (partition.length > 0) {
            // Prefer 5-card combos from partition
            for (var i = 0; i < partition.length; i++) {
                if (partition[i].cards.length === 5) {
                    return { action: "play", cards: partition[i].cards };
                }
            }
            // Prefer non-2 pair from partition
            for (var j = 0; j < partition.length; j++) {
                if (partition[j].type === "pair" && cardRank(partition[j].cards[0]) < 12) {
                    return { action: "play", cards: partition[j].cards };
                }
            }
            // Prefer non-2 single from partition
            for (var k = 0; k < partition.length; k++) {
                if (partition[k].type === "single" && cardRank(partition[k].cards[0]) < 12) {
                    return { action: "play", cards: partition[k].cards };
                }
            }
            return { action: "play", cards: partition[0].cards };
        }

        return { action: "play", cards: [handCards[0]] };
    }

    // If responding to lastCombo
    var candidates = [];
    if (lastCombo.type === "single") {
        for (var s2 = 0; s2 < all.singles.length; s2++) {
            if (canBeat(all.singles[s2], lastCombo)) {
                candidates.push(all.singles[s2]);
            }
        }
    } else if (lastCombo.type === "pair") {
        for (var p2 = 0; p2 < all.pairs.length; p2++) {
            if (canBeat(all.pairs[p2], lastCombo)) {
                candidates.push(all.pairs[p2]);
            }
        }
    } else if (isFiveCardType(lastCombo.type)) {
        var all5 = [].concat(all.straights, all.flushes, all.fullHouses, all.quads, all.straightFlushes);
        for (var f = 0; f < all5.length; f++) {
            if (canBeat(all5[f], lastCombo)) {
                candidates.push(all5[f]);
            }
        }
    }

    if (candidates.length === 0) {
        return { action: "pass", cards: [] };
    }

    // Sort candidates by power ascending
    candidates.sort(function(a, b) { return a.power - b.power; });

    // Endgame check: if any opponent has <= 3 cards, play aggressively
    var isEndgame = false;
    if (counts && counts.length) {
        for (var cIdx = 0; cIdx < counts.length; cIdx++) {
            if (counts[cIdx] > 0 && counts[cIdx] <= 3) {
                isEndgame = true;
                break;
            }
        }
    }

    // Greedy heuristic: play lowest beating candidate
    return { action: "play", cards: candidates[0].cards };
}

/**
 * Safely extracts JSON from a PocketBase record field.
 */
function getRecordJSON(record, field, defaultValue) {
    if (!record) return defaultValue;
    var val = record.get(field);
    if (val === null || val === undefined) return defaultValue;

    // Check if it is a byte array (ASCII code 91 is '[', 123 is '{', 34 is '"', 110 is 'n' (null))
    if (Array.isArray(val) && val.length > 0 && typeof val[0] === "number" && (val[0] === 91 || val[0] === 123 || val[0] === 34 || val[0] === 110)) {
        try {
            var str = "";
            for (var i = 0; i < val.length; i++) {
                str += String.fromCharCode(val[i]);
            }
            return JSON.parse(str);
        } catch (e) {
            return defaultValue;
        }
    }

    if (typeof toString === "function" && val && typeof val === "object" && !Array.isArray(val)) {
        try {
            var s = toString(val);
            if (s) return JSON.parse(s);
        } catch (e2) {}
    }

    if (typeof val === "string") {
        try {
            return JSON.parse(val);
        } catch (e3) {
            return defaultValue;
        }
    }

    return val;
}

/**
 * Generate a random 6-character uppercase alphanumeric room code.
 */
function generateRoomCode() {
    var chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    var code = "";
    for (var i = 0; i < 6; i++) {
        code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
}

/**
 * Finds the next active seat clockwise from startSeat that has cards remaining.
 */
function findNextActiveSeat(counts, startSeat) {
    for (var i = 1; i <= 3; i++) {
        var s = (startSeat + i) % 4;
        if (counts && counts[s] > 0) {
            return s;
        }
    }
    return startSeat;
}

/**
 * Finds the next seat clockwise from startSeat that has cards remaining and has NOT passed in the current trick.
 * If no other eligible player remains (everyone passed or shed), returns -1.
 */
function findNextTrickSeat(counts, passedSeats, startSeat, trickWinnerSeat) {
    passedSeats = passedSeats || [];
    for (var i = 1; i <= 3; i++) {
        var s = (startSeat + i) % 4;
        if (s === trickWinnerSeat) continue;
        if (counts && counts[s] > 0 && passedSeats.indexOf(s) === -1) {
            return s;
        }
    }
    return -1;
}

/**
 * Deals a fresh 52-card deck to 4 seats, creates hands records,
 * determines starting player holding 3♦ (code 0), and transitions game to "playing".
 */
function dealAndStartGame(gameRecord) {
    var deck = createDeck();
    var shuffled = shuffleDeck(deck);

    var handCards = [
        sortCards(shuffled.slice(0, 13)),
        sortCards(shuffled.slice(13, 26)),
        sortCards(shuffled.slice(26, 39)),
        sortCards(shuffled.slice(39, 52))
    ];

    // Find seat holding 3 of Diamonds (card code 0)
    var startingSeat = 0;
    for (var s = 0; s < 4; s++) {
        if (handCards[s].indexOf(0) !== -1) {
            startingSeat = s;
            break;
        }
    }

    var seats = getRecordJSON(gameRecord, "seats", []);
    var handsCollection = $app.findCollectionByNameOrId("hands");

    // Remove any existing hands for this game if rematching
    try {
        var existingHands = $app.findRecordsByFilter("hands", "game_id = {:gameId}", "-created", 10, 0, { gameId: gameRecord.id });
        for (var h = 0; h < existingHands.length; h++) {
            $app.delete(existingHands[h]);
        }
    } catch (e) {}

    // Create 4 hands records
    for (var seatIdx = 0; seatIdx < 4; seatIdx++) {
        var seatInfo = seats[seatIdx];
        var handRecord = new Record(handsCollection, {
            game_id: gameRecord.id,
            user_id: (seatInfo && seatInfo.user_id) ? seatInfo.user_id : null,
            seat_index: seatIdx,
            cards: handCards[seatIdx]
        });
        $app.save(handRecord);
    }

    // Update game record to playing status
    gameRecord.set("status", "playing");
    gameRecord.set("counts", [13, 13, 13, 13]);
    gameRecord.set("turn_index", startingSeat);
    gameRecord.set("leader_index", startingSeat);
    gameRecord.set("last_combo", null);
    gameRecord.set("pass_count", 0);
    gameRecord.set("passed_seats", []);
    gameRecord.set("winner_ranks", []);
    gameRecord.set("turn_started_at", new Date().toISOString());
    $app.save(gameRecord);
}

if (typeof module !== "undefined" && module.exports) {
    module.exports = {
        cardRank: cardRank,
        cardSuit: cardSuit,
        cardCode: cardCode,
        cardName: cardName,
        createDeck: createDeck,
        shuffleDeck: shuffleDeck,
        sortCards: sortCards,
        evaluateCombo: evaluateCombo,
        canBeat: canBeat,
        findAllCombos: findAllCombos,
        decomposeHand: decomposeHand,
        getBotMove: getBotMove,
        isFiveCardType: isFiveCardType,
        isComboEmpty: isComboEmpty,
        getRecordJSON: getRecordJSON,
        generateRoomCode: generateRoomCode,
        findNextActiveSeat: findNextActiveSeat,
        findNextTrickSeat: findNextTrickSeat,
        dealAndStartGame: dealAndStartGame,
        TURN_TIMEOUT_SECS: TURN_TIMEOUT_SECS,
        TURN_TIMEOUT_MS: TURN_TIMEOUT_MS,
        PUBLIC_LOBBY_AUTOSTART_SECS: PUBLIC_LOBBY_AUTOSTART_SECS,
        PUBLIC_LOBBY_AUTOSTART_MS: PUBLIC_LOBBY_AUTOSTART_MS
    };
}
