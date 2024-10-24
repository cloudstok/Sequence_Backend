import axios from "axios";
import { prepareDataForWebhook } from "../utilities/common-function.js";
import { getCache, setCache } from "../utilities/redis-connection.js";

export default class Player {
    constructor(playerDetails, socketId, maxAmount) {
        const { id, name, token, image } = playerDetails;
        this.id = id;
        this.socketId = socketId;
        this.name = name;
        this.userToken = token;
        this.winAmount = 0;
        this.depositAmount = maxAmount;
        this.avatar = image;
        this.status = "ACTIVE";
        this.wollenAmount = 1146;
        this.hand = [];
        this.pos = 0;
        this.chipColor = '';
        this.sequenceCount = 0;
        this.skipCount = 0;
        this.isTurn = false;
        this.isEliminated = false;
        this.isWinner = false;
    }

    resetPlayerForNewGame() {
        this.dealer = false;
        this.isEliminated = false;
        this.gameStatus = '6';
        this.points = 0;
        this.turnCount = 0;
        this.isCardPick = false;
        this.missedTurns = 0;
        // this.pos = 0;
        this.hand = [];
        this.cardGroups = [];
        this.isTurn = false;
        this.isWinner = false;
    }

    drawCard(card) {
        this.hand.push(card);
    }

    async updateBalanceFromAccount(data, key, io) {
        try {
            const socketId = data.socket_id;
            let playerDetails = await getCache(`PL:${socketId}`);
            if (!playerDetails) return false;
            playerDetails = JSON.parse(playerDetails);
            const socket = io.sockets.sockets.get(socketId);
            const webhookData = await prepareDataForWebhook({ ...data, game_id: playerDetails.game_id }, key, socket);
            if (key === 'DEBIT') this.txn_id = webhookData.txn_id;
            const sendRequest = await this.sendRequestToAccounts(webhookData, this.token);
            if (!sendRequest) return false;
            if (key === 'DEBIT') playerDetails.balance -= this.depositWallet;
            else playerDetails.balance += data.winning_amount;
            await setCache(`PL:${socketId}`, JSON.stringify(playerDetails));
            return true;
        } catch (err) {
            console.error(`Err while updating Player's balance is`, err);
            return false;
        }
    }

    async sendRequestToAccounts(webhookData, token) {
        try {
            const url = process.env.service_base_url;
            let clientServerOptions = {
                method: 'POST',
                url: `${url}/service/operator/user/balance`,
                headers: {
                    token
                },
                data: webhookData,
                timeout: 1000 * 2
            };
            const data = (await axios(clientServerOptions))?.data;
            if (!data.status) return false;
            return true;
        } catch (err) {
            console.error(`Err while sending request to accounts is:::`, err?.message);
            return false;
        }
    }


    getGroupedCardsDetails(playerHand, groupedCardIds) {
        const cardMap = {};

        playerHand.forEach(card => {
            cardMap[card.id] = card.rVal;
        });

        const groupCards = [];
        groupedCardIds.forEach(group => {
            const groupDetails = group.map(cardId => {
                if (cardMap[cardId]) {
                    const rVal = cardMap[cardId];
                    return { id: cardId, rVal };
                } else {
                    return null;
                }
            }).filter(card => card !== null);

            groupCards.push(groupDetails);
        });

        return groupCards;
    }

    processCardGroups(cardGroups, cutJokers) {
        const getCardValue = (rVal) => {
            const faceValue = rVal.slice(1);
            switch (faceValue) {
                case '01': return 1;   // Ace
                case '11': return 11;  // Jack
                case '12': return 12;  // Queen
                case '13': return 13;  // King
                default: return parseInt(faceValue); // For 2-10
            }
        };

        const sortCards = (group) => group.sort((a, b) => getCardValue(a.rVal) - getCardValue(b.rVal));

        const isAceSequence = (group) => {
            const values = group.map(card => getCardValue(card.rVal));
            const suits = group.map(card => card.rVal[0]);
            const allSameSuit = suits.every(suit => suit === suits[0]);
            return allSameSuit && (values.includes(1) && (values.includes(2) && values.includes(3) || values.includes(12) && values.includes(13)));
        };

        // Treat cut jokers as normal cards in pure sequence/pure set
        const isJoker = (card, isPure = false) => {
            return !isPure && (card.rVal.startsWith('J') || cutJokers.includes(card.id));
        };

        const isPureSequence = (group) => {
            if (group.length < 3) return false;
            if (isAceSequence(group)) return true;

            let suit = group[0].rVal[0];
            let sortedGroup = sortCards(group);

            for (let i = 1; i < sortedGroup.length; i++) {
                if (isJoker(sortedGroup[i], true)) continue;
                if (sortedGroup[i].rVal[0] !== suit || getCardValue(sortedGroup[i].rVal) !== getCardValue(sortedGroup[i - 1].rVal) + 1) {
                    return false;
                }
            }
            return true;
        };

        const isImpureSequence = (group) => {
            if (group.length < 3) return false;

            let sortedGroup = sortCards(group.filter(card => !isJoker(card)));
            let suit = sortedGroup[0].rVal[0];
            let missingCount = 0;
            let jokersUsed = group.filter(card => isJoker(card)).length; // Count jokers used

            // Check for gaps
            for (let i = 1; i < sortedGroup.length; i++) {
                const currentValue = getCardValue(sortedGroup[i].rVal);
                const previousValue = getCardValue(sortedGroup[i - 1].rVal);
                const currentSuit = sortedGroup[i].rVal[0];

                // Ensure same suit
                if (currentSuit !== suit) return false;

                // Check for value gaps
                if (currentValue !== previousValue + 1) {
                    missingCount += (currentValue - previousValue - 1); // Count the number of missing cards
                }
            }

            // Allow up to 2 jokers for the gaps
            return missingCount <= 2 && jokersUsed <= 2;
        };

        const isPureSet = (group) => {
            let value = getCardValue(group.filter(card => !isJoker(card, true))[0].rVal);
            let suits = new Set();

            for (let card of group) {
                if (!isJoker(card) && getCardValue(card.rVal) !== value) return false;
                if (!isJoker(card)) {
                    if (suits.has(card.rVal[0])) return false;
                    suits.add(card.rVal[0]);
                }
            }
            return true;
        };

        const isImpureSet = (group) => {
            let value = getCardValue(group.filter(card => !isJoker(card))[0].rVal);
            let suits = new Set();
            let jokersUsed = group.filter(card => isJoker(card)).length; // Count jokers used

            for (let card of group) {
                if (!isJoker(card)) {
                    if (getCardValue(card.rVal) !== value) return false;
                    if (suits.has(card.rVal[0])) return false;
                    suits.add(card.rVal[0]);
                }
            }

            // Allow a maximum of 2 jokers in the set
            return jokersUsed <= 2;
        };

        const calculatePoints = (group) => group.reduce((acc, card) => {
            if (isJoker(card) || cutJokers.includes(card.id)) return acc;
            let value = getCardValue(card.rVal);
            return acc + (value === 1 ? 10 : (value > 10 ? 10 : value)); // Ace worth 10 points, J/Q/K worth 10 points
        }, 0);

        let groupedCards = [];
        let ungroupedCards = [];
        let pureSequenceCount = 0;
        let impureSequenceCount = 0;
        let pureSetCount = 0;
        let impureSetCount = 0;

        cardGroups.forEach(group => {
            if (group.length >= 3) {
                if (isPureSequence(group)) {
                    groupedCards.push({ group, type: 'pure sequence' });
                    pureSequenceCount++;
                } else if (isImpureSequence(group)) {
                    groupedCards.push({ group, type: 'impure sequence' });
                    impureSequenceCount++;
                } else if (isPureSet(group)) {
                    groupedCards.push({ group, type: 'pure set' });
                    pureSetCount++;
                } else if (isImpureSet(group)) {
                    groupedCards.push({ group, type: 'impure set' });
                    impureSetCount++;
                } else {
                    ungroupedCards.push(...group);
                }
            } else {
                ungroupedCards.push(...group);
            }
        });

        let points = calculatePoints(ungroupedCards);

        return {
            groupedCards,
            ungroupedCards,
            points,
            pureSequenceCount,
            impureSequenceCount,
            pureSetCount,
            impureSetCount
        };
    };

    calculateRummyGroups(playerHand, CardIds, cutJokers) {

        const initGroupCards = this.getGroupedCardsDetails(playerHand, CardIds);
        const cardMeldResult = this.processCardGroups(initGroupCards, cutJokers);
        this.cardGroups = initGroupCards;
        return cardMeldResult;
    }

    // getCardPoints(card) {
    //     const value = parseInt(card.rVal.slice(1));
    //     if (card.rVal.charAt(0) === 'J') return 0;
    //     if (value >= 10 || value == '01') return 10;
    //     return value;
    // }

    // calculateRummyGroups(playerHand, CardIds) {
    //     let jokers = [];
    //     let pureSequences = [];
    //     let impureSequences = [];
    //     let pureSets = [];
    //     let impureSets = [];
    //     let ungroupedCards = [];
    //     let usedCards = new Set();  

    //     const initGroupCards = this.getGroupedCardsDetails(playerHand, CardIds);
    //     playerHand = initGroupCards.flat();

    //     function cleanCard(card) {
    //         return { id: card.id, rVal: card.rVal };
    //     }

    //     function removeCardsFromSuits(cards) {
    //         cards.forEach(card => {
    //             for (let suit in suits) {
    //                 suits[suit] = suits[suit].filter(c => c.id !== card.id);
    //             };
    //             usedCards.add(card.id);
    //         });
    //     }

    //     const suits = { S: [], H: [], D: [], C: [] };

    //     playerHand.forEach(card => {
    //         if (card.rVal === "J01" || card.rVal === "J02") {
    //             jokers.push(card);
    //         } else {
    //             const suit = card.rVal.charAt(0);
    //             const value = parseInt(card.rVal.slice(1));
    //             if (value == '01') {
    //                 suits[suit].push({ ...card, value: 1 });  // Low Ace (1)
    //                 suits[suit].push({ ...card, value: 14 }); // High Ace (14 for K-Q-J-A)
    //             } else if (suit !== 'J') {
    //                 suits[suit].push({ ...card, value });
    //             }
    //         }
    //     });

    //     function checkPureSequence(cards) {
    //         let sequence = [];
    //         for (let i = 0; i < cards.length; i++) {
    //             if (usedCards.has(cards[i].id)) continue;
    //             if (sequence.length === 0 || cards[i].value === sequence[sequence.length - 1].value + 1) {
    //                 sequence.push(cards[i]);
    //             } else {
    //                 if (sequence.length >= 3) {
    //                     pureSequences.push(sequence.map(cleanCard));
    //                     removeCardsFromSuits(sequence);
    //                 }
    //                 sequence = [cards[i]];
    //             }
    //         }
    //         if (sequence.length >= 3) {
    //             pureSequences.push(sequence.map(cleanCard));
    //             removeCardsFromSuits(sequence);
    //         }
    //     }

    //     for (let suit in suits) {
    //         suits[suit].sort((a, b) => a.value - b.value);
    //         checkPureSequence(suits[suit]);
    //     }


    //     function checkImpureSequence(cards) {
    //         let sequence = [];
    //         let jokerUsed = 0;

    //         for (let i = 0; i < cards.length; i++) {
    //             if (usedCards.has(cards[i].id)) continue;
    //             if (sequence.length === 0 || cards[i].value === sequence[sequence.length - 1].value + 1) {
    //                 sequence.push(cards[i]);
    //             } else if (jokerUsed < 2 && jokers.length > 0 && cards[i].value === sequence[sequence.length - 1].value + 2) {
    //                 // Use a joker for the impure sequence
    //                 sequence.push(jokers.pop());
    //                 sequence.push(cards[i]);
    //                 jokerUsed++;
    //             } else {
    //                 if (sequence.length >= 3) {
    //                     impureSequences.push(sequence.map(cleanCard));
    //                     removeCardsFromSuits(sequence);

    //                 }
    //                 sequence = [cards[i]];
    //                 jokerUsed = 0;
    //             }
    //         }

    //         if (sequence.length >= 3) {
    //             impureSequences.push(sequence.map(cleanCard));
    //             removeCardsFromSuits(sequence);
    //         }
    //     }

    //     for (let suit in suits) {
    //         checkImpureSequence(suits[suit]);
    //     }

    //     const valueMap = {};
    //     playerHand.forEach(card => {
    //         const value = parseInt(card.rVal.slice(1));
    //         if (value !== 'J') {
    //             valueMap[value] = valueMap[value] ? valueMap[value] + 1 : 1;
    //         }
    //     });

    //     Object.keys(valueMap).forEach(value => {
    //         if (valueMap[value] >= 3) {
    //             const setCards = playerHand.filter(card => parseInt(card.rVal.slice(1)) == value && !usedCards.has(card.id));
    //             if (setCards.length >= 3) {
    //                 pureSets.push(setCards.map(cleanCard));
    //                 removeCardsFromSuits(setCards);
    //             }
    //         }
    //     });

    //     Object.keys(valueMap).forEach(value => {
    //         if (valueMap[value] <= 2 && jokers.length > 0) {
    //             const setCards = playerHand.filter(card => parseInt(card.rVal.slice(1)) == value && !usedCards.has(card.id));
    //             //Allow up to 2 Jokers for impure sets
    //             while (setCards.length < 3 && jokers.length > 0) {
    //                 setCards.push(jokers.pop());
    //             }
    //             if (setCards.length === 3) {
    //                 impureSets.push(setCards.map(cleanCard));
    //                 removeCardsFromSuits(setCards);
    //             }
    //         }
    //     });


    //     const totalGrouped = [
    //         ...pureSequences.flat(),
    //         ...impureSequences.flat(),
    //         ...pureSets.flat(),
    //         ...impureSets.flat()
    //     ].map(card => card.id);

    //     ungroupedCards = playerHand.filter(card => !totalGrouped.includes(card.id)).map(cleanCard);

    //     const cardGroups = [...pureSequences, ...impureSequences, ...pureSets, ...impureSets, ungroupedCards].filter(e=> e.length > 0);

    //     const pureSequenceCount = pureSequences.length;
    //     const impureSequenceCount = impureSequences.length;
    //     const isAllMelded = ungroupedCards.length === 0;

    //     const points = isAllMelded ? 0 : Math.min(ungroupedCards.reduce((sum, card) => sum + this.getCardPoints(card), 0), 80);

    //     this.cardGroups =  initGroupCards;

    //     return {
    //         cardGroups,
    //         pureSequenceCount,
    //         impureSequenceCount,
    //         points,
    //         isAllMelded
    //     };
    // }

}