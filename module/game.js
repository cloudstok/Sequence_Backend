import Deck from './deck.js';
import {
    emitLobbyDetails,
    getGameObj,
    removeGameFromList,
    // restartGame
} from '../services/gameEvents.js';
import PlayerDeck from './player-deck.js';
const timers = new Map();

export default class Game {
    constructor(gameDetails, roomId) {
        const { id, entryAmount, maxPlayer } = gameDetails;
        this.id = roomId;
        this.gameId = id;
        this.players = [];
        this.status = 'WAITING';
        this.currentPlayerTurnPos = 0;
        this.betAmount = Number(entryAmount);
        this.maxPlayer = maxPlayer;
        this.isStarted = false;
        this.isFinished = false;
        this.winner = null;
        this.Deck = new Deck(2);
        this.playerDeck = new PlayerDeck(2);
        this.turn = [];
        this.playerTurnTime = [];
        this.sequenceData = [];
        this.resultData = [];
    }

    updateMeRequest(playerId, socket, event = 'reconnection') {
        console.log("UPDATE_ME_REQUest>>>>>>>>>>>>", playerId);
        const player = this.players.find(p => p.id === playerId);
        console.log("Update Request Socket Id before refresh>>>>>>>>>>>>", playerId, player.socketId);
        if (!player) {
            return socket.emit('message', { eventName: 'error', data: { message: 'Invalid Player ID' } });
        }
        player.socketId = socket.id;
        socket.join(this.id);
        const eventData = {
            status: true,
            message: 'Latest game status',
            gameData: { ...getGameObj(this.id), SEQUENCE: this.sequenceData, roomName: this.id },
            gameBoard: this.boardCards,
            currentPlayerData: player,
            maxTime: 20,
            turnData: { remainingTurnsTime: 18, turnPlayerData: this.players[this.currentPlayerTurnPos].id }
        }
        const eventName = event == 'gameStatus' ? 'GAME_STATUS' : 'REJOIN_GAME_START_WAITING_STATE';
        return socket.emit('message', { eventName, data: eventData });
    }

    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    addPlayer(player, maxPlayer) {
        const playerNo = this.players.length;
        if (playerNo < Number(maxPlayer)) {
            this.players.push(player);
        }
    }

    async startGame(players, minPlayer, io) {
        const chipColors = ["BLUE", "PURPLE", "YELLOW"];
        const updatedPlayers = await Promise.all(players.map(async (player, i) => {
            player.chipColor = chipColors[i]
            console.log(player.id, player.socketId, "<<<<<<1");
            console.log(player.id, this.roundCount, "<<<<<<<<<PlayerId")
            const updateBalanceData = {
                id: this.id,
                bet_amount: this.betAmount,
                socket_id: player.socketId,
                user_id: player.id.split(':')[1]
            };
            // const isTransactionSuccessful = await player.updateBalanceFromAccount(updateBalanceData, "DEBIT", io);
            // return isTransactionSuccessful ? player : null;
            return player;
        }));

        this.players = updatedPlayers.filter(player => player !== null);

        if (this.players.length < minPlayer) {
            return removeGameFromList(this.id, this.gameId, io);
        }

        this.isStarted = true;

        setTimeout(() => this.dealCards(io), 1000);
    }

    dealCards(io) {
        this.Deck.shuffle();
        const jokers = this.Deck.cards.filter(e => e.rVal[0] === 'J').sort((a, b) => a.rVal.slice(1) - b.rVal.slice(1));
        const nonJokerCards = this.Deck.cards.filter(e => e.rVal[0] !== 'J');

        // Create an empty boardCards with 100 slots
        this.boardCards = new Array(100).fill(null);

        // Place jokers at the specific indices
        const jokerIndices = [0, 9, 90, 99];
        jokerIndices.forEach((index, i) => {
            if (jokers[i]) {
                this.boardCards[index] = { ...jokers[i], index: index }; // Assign joker and set index
            }
        });

        // Fill remaining spots with non-joker cards
        let nonJokerIndex = 0;
        for (let i = 0; i < this.boardCards.length; i++) {
            // Skip the indices where jokers have been placed
            if (this.boardCards[i] === null) {
                while (nonJokerIndex < nonJokerCards.length && (nonJokerCards[nonJokerIndex].index !== undefined)) {
                    nonJokerIndex++;
                }
                if (nonJokerIndex < nonJokerCards.length) {
                    this.boardCards[i] = { ...nonJokerCards[nonJokerIndex], index: i };
                    nonJokerIndex++;
                }
            }
        }

        // Remove null values (if any, should be none now)
        this.boardCards = this.boardCards.filter(card => card !== null);

        console.log(JSON.stringify(this.boardCards));
        io.to(this.id).emit('message', {
            eventName: "GAME_START_WAITING_STATE",
            data: {
                maxTime: 60,
                currentTime: 0,
                message: "Game will start shortly",
                status: true,
                gameBoard: this.boardCards,
                gameData: { ...getGameObj(this.id), roomName: this.id }
            }
        });

        this.playerDeck.shuffle();
        console.log("1>>>>>>>", this.players);
        for (let j = 0; j < this.players.length; j++) {
            const playerIndex = (this.currentPlayerTurnPos + j) % this.players.length;
            for (let i = 0; i < 6; i++) {
                const card = this.playerDeck.draw(); // Draw one card from the deck
                if (card) { // Check if the card is valid (not undefined)
                    console.log(playerIndex, "<<<<<<<<<<<<1");
                    this.players[playerIndex].drawCard(card);
                }
            }
        }
        for (let player of this.players) {
            console.log("Player's Card length after distribution", player.hand.length);
            const eventData = {
                currentTime: 0,
                maxTime: 30,
                cards: player.hand,
                roomName: this.id,
                status: true
            };
            io.to(player.socketId).emit('message', {
                eventName: 'CARD_DISTRIBUTE_STATE',
                data: eventData
            });
            console.log("CARD_DISTRIBUTE_STATE>>>>>>>>>>>>", player.id, player.hand.length);
            // this.trackEvent('CARD_DISTRIBUTE_STATE', eventData);
        }
        this.nextTurn(io);
    }

    async checkPlayerSequences(player, io) {
        const boardCards = this.boardCards;
        const BOARD_SIZE = 10;
        const JOKER_POSITIONS = [0, 9, 90, 99];
        const playerId = player.id;

        console.log(JSON.stringify(this.boardCards.filter(card => card.owner == playerId)), "Player Cards Owned");

        // Create a 2D board representation from the boardCard array, initially filled with undefined
        const board = Array.from({ length: BOARD_SIZE }, () => Array(BOARD_SIZE).fill(undefined));

        // Initialize 2D arrays to track locked chips for horizontal, vertical, and diagonal directions
        const lockedHorizontal = Array.from({ length: BOARD_SIZE }, () => Array(BOARD_SIZE).fill(false));
        const lockedVertical = Array.from({ length: BOARD_SIZE }, () => Array(BOARD_SIZE).fill(false));
        const lockedDiagonalRight = Array.from({ length: BOARD_SIZE }, () => Array(BOARD_SIZE).fill(false));
        const lockedDiagonalLeft = Array.from({ length: BOARD_SIZE }, () => Array(BOARD_SIZE).fill(false));

        // Initialize an object to track how many times jokers are used in sequences
        const jokerUsage = {};
        JOKER_POSITIONS.forEach(pos => {
            jokerUsage[pos] = 0;  // Initialize joker usage count to 0
        });

        // Fill the board with player ids and mark jokers
        boardCards.forEach(card => {
            const row = Math.floor(card.index / BOARD_SIZE);
            const col = card.index % BOARD_SIZE;
            board[row][col] = {
                owner: JOKER_POSITIONS.includes(card.index) ? 'JOKER' : card.owner,
                isChipPlaced: JOKER_POSITIONS.includes(card.index) ? true : card.isChipPlaced,
                isChipLocked: card.isChipLocked,
                index: card.index,  // Store the index to track sequences
            };
        });

        // Function to check if there is a sequence of 5 in a row, return details, and lock the sequence
        function getSequence(row, col, dRow, dCol, lockArray) {
            let count = 0;
            let jokersUsed = 0;
            const sequence = [];

            for (let i = 0; i < 5; i++) {
                const r = row + i * dRow;
                const c = col + i * dCol;

                // Check if out of bounds
                if (r < 0 || r >= BOARD_SIZE || c < 0 || c >= BOARD_SIZE) return null;

                const cell = board[r][c];

                // Ensure the cell exists, is not undefined, and the chip is placed
                if (!cell) return null;

                // Ensure the chip is placed or it's a joker
                if (!cell.isChipPlaced && cell.owner !== 'JOKER') return null;

                if (cell.isChipLocked && cell.owner !== 'JOKER') return null;

                // Check if already locked in this direction
                if (lockArray[r][c]) return null;

                if (cell.owner === playerId) {
                    count++;
                    sequence.push(cell.index);  // Add the card index to the sequence
                } else if (cell.owner === 'JOKER' || JOKER_POSITIONS.includes(cell.index)) {
                    // Check if the joker can be used in a sequence (used in less than 3 sequences)
                    if (jokerUsage[cell.index] >= 3) return null;
                    jokersUsed++;
                    sequence.push(cell.index);  // Add the joker card index to the sequence
                } else {
                    return null;
                }
            }

            // Ensure there are at least 5 chips in a row (including jokers)
            if (count + jokersUsed === 5) {
                console.log(`Found a sequence: ${sequence}`);  // Debugging log

                // Lock the sequence to prevent reuse in this direction
                for (let i = 0; i < 5; i++) {
                    const r = row + i * dRow;
                    const c = col + i * dCol;
                    lockArray[r][c] = true;

                    // Increment joker usage if a joker is part of this sequence
                    if (JOKER_POSITIONS.includes(board[r][c].index)) {
                        jokerUsage[board[r][c].index]++;
                    }
                }

                return sequence;
            }
            return null;
        }

        // Search the board for sequences and store the sequence details
        let sequenceCount = 0;
        const sequences = [];

        for (let row = 0; row < BOARD_SIZE; row++) {
            for (let col = 0; col < BOARD_SIZE; col++) {
                // Skip cells that don't exist
                if (!board[row][col]) continue;

                // Check horizontal sequence (if not locked horizontally)
                const horizontalSeq = getSequence(row, col, 0, 1, lockedHorizontal);
                if (horizontalSeq) {
                    sequenceCount++;
                    sequences.push(horizontalSeq);
                }

                // Check vertical sequence (if not locked vertically)
                const verticalSeq = getSequence(row, col, 1, 0, lockedVertical);
                if (verticalSeq) {
                    sequenceCount++;
                    sequences.push(verticalSeq);
                }

                // Check diagonal (top-left to bottom-right) (if not locked diagonally right)
                const diagonalRightSeq = getSequence(row, col, 1, 1, lockedDiagonalRight);
                if (diagonalRightSeq) {
                    sequenceCount++;
                    sequences.push(diagonalRightSeq);
                }

                // Check diagonal (top-right to bottom-left) (if not locked diagonally left)
                const diagonalLeftSeq = getSequence(row, col, 1, -1, lockedDiagonalLeft);
                if (diagonalLeftSeq) {
                    sequenceCount++;
                    sequences.push(diagonalLeftSeq);
                }

            }
        }

        // Emit sequence event and update locked cards if sequences are found
        console.log("Sequence Created>>>>>", sequences);
        if (sequenceCount > 0) {
            const player = this.players.find(p => p.id == playerId);
            player.sequenceCount += sequenceCount;
            const playerSequenceCards = sequences.map(group => {
                return group.map(cardIndex => {
                    this.boardCards[cardIndex].isChipLocked = true;
                    return this.boardCards[cardIndex];
                });
            });

            this.sequenceData.push(playerSequenceCards);
            io.to(this.id).emit('message', {
                eventName: 'SEQUENCE',
                data: {
                    status: true,
                    uid: player.id,
                    chipColor: player.chipColor,
                    currentPlayerPos: this.currentPlayerTurnPos,
                    sequenceData: playerSequenceCards
                }
            });
        }

        return {
            sequenceCount
        };
    }

    async placeCards(boardCardPos, cardId, playerId, io) {
        console.log("PlaceCards>>>>>>>>>>>>", playerId);
        const player = this.players.find(p => p.id === playerId);
        if (player) {
            if (player.isEliminated) {
                return io.to(player.socketId).emit('message', { eventName: 'UserActionRequest', data: { message: 'Player is Eliminated', status: false } });
            }
            if (!player.isTurn) {
                console.log("1>>>>>>>Error>>>>>>", 'Wait for your turn');
                return io.to(player.socketId).emit('message', { eventName: 'UserActionRequest', data: { message: 'Please, Wait for your turn', status: false } });
            }

            player.missedTurns = 0;

            const timerKey = `${player.id}-${this.id}`;
            if (timers.has(timerKey)) {
                clearTimeout(timers.get(timerKey));
                timers.delete(timerKey);
            }

            const boardCard = this.boardCards[boardCardPos];
            if (!boardCard) return io.to(player.socketId).emit('message', { eventName: 'UserActionRequest', data: { message: 'Invalid Board Card', status: false } });
            if (boardCard.isChipLocked) return io.to(player.socketId).emit('message', { eventName: 'UserActionRequest', data: { message: 'Chip is locked', status: false } });
            const playerCard = player.hand.find(e => e.id == cardId);
            if (!playerCard) return io.to(player.socketId).emit('message', { eventName: 'UserActionRequest', data: { message: 'Invalid Player Card', status: false } });
            if (boardCard.rVal[0] == 'J') return io.to(player.socketId).emit('message', { eventName: 'UserActionRequest', data: { message: 'Chip cannot be placed on Corner Cards', status: false } });
            if ((playerCard.rVal[0] == 'H' || playerCard.rVal[0] == 'S') && playerCard.rVal.slice(1) == '11') {
                if (boardCard.owner == player.id) return io.to(player.socketId).emit('message', { eventName: 'UserActionRequest', data: { message: 'User cannot remove his owned chip', status: false } });
                this.boardCards[boardCardPos].owner = '';
                this.boardCards[boardCardPos].isChipPlaced = false;
                io.to(this.id).emit('message', {
                    eventName: 'CHIP_REMOVED', data: {
                        uid: player.id,
                        chipColor: player.chipColor,
                        id: playerCard.id,
                        index: boardCard.index,
                        rVal: playerCard.rVal
                    }
                });
            } else {
                const isCardJack = (playerCard.rVal[0] == 'D' || playerCard.rVal[0] == 'C') && playerCard.rVal.slice(1) == '11';
                if (boardCard.isChipPlaced) return io.to(player.socketId).emit('message', { eventName: 'UserActionRequest', data: { message: 'Chip Already placed on Card', status: false } });
                if ((boardCard.rVal.slice(1) != playerCard.rVal.slice(1)) && !isCardJack) return io.to(player.socketId).emit('message', { eventName: 'UserActionRequest', data: { message: 'Chip cannot be placed on given position', status: false } });
                this.boardCards[boardCardPos].isChipPlaced = true;
                this.boardCards[boardCardPos].owner = player.id;
                io.to(this.id).emit('message', {
                    eventName: 'CHIP_PLACED', data: {
                        uid: player.id,
                        chipColor: player.chipColor,
                        id: playerCard.id,
                        index: boardCard.index,
                        rVal: playerCard.rVal
                    }
                });
                await this.checkPlayerSequences(player, io);
                if ((player.sequenceCount > 0 && this.players.length == 3) || (player.sequenceCount > 1 && this.players.length == 2)) {
                    setTimeout(() => {
                        player.isWinner = true;
                        const result = [];
                        this.players.map(p => {
                            const resultData = {
                                uid: p.id,
                                name: p.name,
                                isWinner: p.isWinner,
                                chipColor: p.chipColor,
                                betAmount: this.betAmount,
                                winAmount: p.isWinner ? ((this.betAmount * this.players.length) * ((100 - 10) / 100)) : (0 - this.betAmount)
                            };
                            result.push(resultData);
                        })
                        const eventData = {
                            status: true,
                            isDraw: false,
                            resultData: result
                        };
                        io.to(this.id).emit('message', { eventName: 'RESULT_EVENT', data: eventData });
                        removeGameFromList(this.id, this.gameId);
                    }, 2000);
                    return;
                };
            };
            player.isTurn = false;
            player.hand = player.hand.filter(card => card.id !== cardId);
            const newCard = this.playerDeck.cards.find(card => card.rVal.slice(1) == '11');
            player.drawCard(newCard);
            setTimeout(() => {
                io.to(player.socketId).emit('message', {
                    eventName: 'NEW_CARD', data: {
                        uid: player.id,
                        chipColor: player.chipColor,
                        newCard
                    }
                });
            }, 1000);
            setTimeout(() => this.nextTurn(io), 2000);
        }
        return null;
    }

    getCurrentPlayer() {
        return this.players[this.currentPlayerTurnPos];
    }

    nextTurn(io) {
        const currentPlayer = (this.getCurrentPlayer());
        currentPlayer.isTurn = false;
        this.currentPlayerTurnPos = (this.currentPlayerTurnPos + 1) % this.players.length;
        const nextPlayer = this.players[this.currentPlayerTurnPos];
        nextPlayer.isTurn = true;
        const eventData = {
            MAX_TIME: 20,
            currentTime: 0,
            roomName: this.id,
            currentPlayerData: nextPlayer,
            currentPlayerPos: this.currentPlayerTurnPos,
            status: true,
            message: "Player turn"
        };
        io.to(this.id).emit('message', {
            eventName: 'TURN_STATE',
            data: eventData
        });
        console.log("TURN_STATE FOR>>>>>>>>>>>>", nextPlayer.id);

        const timerKey = `${nextPlayer.id}-${this.id}`;
        if (timers.has(timerKey)) {
            clearTimeout(timers.get(timerKey));
            timers.delete(timerKey);
        }

        const timerId = setTimeout(() => {
            nextPlayer.missedTurns += 1;
            if (nextPlayer.missedTurns >= 3) this.dropPlayerFromGame(nextPlayer.id, io);
            else this.nextTurn(io);
        }, 15 * 1000);

        timers.set(timerKey, timerId);
    }

    dropPlayerFromGame(playerId, io) {
        const player = this.players.find(p => p.id === playerId);
        if (!player) return io.to(player.socketId).emit('message', { eventName: 'error', data: { message: 'Invalid Player Details' } });
        player.isEliminated = true;

        const validPlayers = this.players.filter(p => !p.isEliminated);
        if (validPlayers.length == 1) {
            this.isFinished = true;
            const winnerIndex = this.players.findIndex(el => el.id === validPlayers[0].id);
            const winningPlayer = this.players[winnerIndex];
            this.winner = winningPlayer;
            winningPlayer.isWinner = true;
            const result = [];
            this.players.map(p => {
                const resultData = {
                    uid: p.id,
                    name: p.name,
                    isWinner: p.isWinner,
                    chipColor: p.chipColor,
                    betAmount: this.betAmount,
                    winAmount: p.isWinner ? ((this.betAmount * this.players.length) * ((100 - 10) / 100)) : (0 - this.betAmount)
                };
                result.push(resultData);
            });
            const eventData = {
                status: true,
                isDraw: false,
                resultData: result
            };
            io.to(this.id).emit('message', { eventName: 'RESULT_EVENT', data: eventData });
            removeGameFromList(this.id, this.gameId);
        } else if (validPlayers.length > 1) {
            this.nextTurn(io);
        }
        return;
    }

    discardCard(playerId, cardId, io) {
        const player = this.players.find(p => p.id === playerId);
        if (player.isEliminated) {
            return io.to(player.socketId).emit('message', { eventName: 'DiscardCard', data: { message: 'Player is Eliminated', status: false } });
        }
        if (!player.isTurn) {
            console.log("1>>>>>>>Error>>>>>>", 'Wait for your turn');
            return io.to(player.socketId).emit('message', { eventName: 'DiscardCard', data: { message: 'Please, Wait for your turn', status: false } });
        }
        const playerCard = player.hand.find(e => e.id == cardId);
        if (!playerCard) return io.to(player.socketId).emit('message', { eventName: 'DiscardCard', data: { message: 'Invalid Player Card', status: false } });
        const boardCardsData = this.boardCards.filter(card => (card.rVal == playerCard.rVal) && !card.isChipPlaced);
        if (boardCardsData.length > 0) return io.to(player.socketId).emit('message', { eventName: 'DiscardCard', data: { message: 'Invalid Card Request', status: false } });
        player.hand = player.hand.filter(card => card.id !== cardId);
        // const newCard = this.playerDeck.draw();
        const newCard = this.playerDeck.cards.find(card => card.rVal.slice(1) == '11');
        player.drawCard(newCard);
        io.to(player.socketId).emit('message', {
            eventName: 'NEW_CARD', data: {
                uid: player.id,
                chipColor: player.chipColor,
                newCard
            }
        });
    }

    removePlayerFromGame(playerId, io, socket) {
        console.log("removePlayerFromGame0>>>>>>>>>>>>", playerId);
        socket.leave(this.id);
        socket.emit('message', {
            eventName: 'GAME_LEAVE',
            data: {}
        });
        if (this.isStarted) this.dropPlayerFromGame(playerId, io);
        else {
            this.players = this.players.filter(p => p.id !== playerId);
            emitLobbyDetails(io);
        }
    }
}