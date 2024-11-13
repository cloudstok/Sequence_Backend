import { generateDeck, shuffle } from './deck.js';
import { removeGameFromList } from '../services/gameEvents.js';
import { generateDeckForPlayer } from './player-deck.js';
import { deleteCache, getCache, setCache } from '../utilities/redis-connection.js';
import { sendCreditRequest, updateBalanceFromAccount } from './player.js';
import { insertSettlement } from './db-data/bets-db.js';
const timers = new Map();

export const generateGameData = (gameDetails, roomId) => {
    const { id, entryAmount, maxPlayer, winAmount } = gameDetails;
    const gameData = {
        id: roomId,
        isLobbyInitiated: false,
        gameId: id,
        players: [],
        status: 'WAITING',
        currentPlayerTurnPos: 0,
        betAmount: Number(entryAmount),
        maxPlayer: maxPlayer,
        gameStartTime: Date.now(),
        isStarted: false,
        isFinished: false,
        winner: null,
        Deck: generateDeck(2),
        playerDeck: generateDeckForPlayer(2),
        winAmount: winAmount,
        sequenceData: [],
        resultData: [],
    };
    return gameData;
}

export const updateMeRequest = async (game, playerId, socket, event = 'reconnection') => {
    const playerIndex = game.players.findIndex(p => p.id === playerId);
    const player = game.players[playerIndex];
    if (!game.isStarted) {
        return socket.emit('message', {
            eventName: 'REJOIN_PLAYER_WAITING_STATE', data: {
                maxTime: 60,
                maxDateTime: Date.now(),
                current_time: 60 - ((Date.now() - game.gameStartTime) / 1000),
                message: "Please wait for other players to join game",
                roomName: game.id,
                status: true
            }
        })
    }
    if (!player) {
        return socket.emit('message', { eventName: 'error', data: { message: 'Invalid Player ID' } });
    }
    player.socketId = socket.id;
    game.players[playerIndex] = player;
    socket.join(game.id);
    await setCache(`game:${game.id}`, JSON.stringify(game));
    const eventData = {
        gameData: {
            roomName: game.id,
            currentPlayerTurnPos: game.currentPlayerTurnPos,
            winAmount: game.winAmount,
            players: game.players.map(player => {
                const data = {
                    id : player.id,
                    name : player.name,
                    chipColor : player.chipColor,
                    skipCount: player.skipCount
                }
                return data
            })
        },
        gameBoard: game.boardCards,
        currentPlayerData: {
            id: player.id,
            name: player.name,
            chipColor: player.chipColor,
            hand: player.hand.map(e => { 
                const data = {  id : e.id, rVal : e.rVal }
                return data
            })
        },
        turnData: {
            remainingTurnsTime: 18,
            turnPlayerData: game.players[game.currentPlayerTurnPos].id
        }
    }
    const eventName = event == 'gameStatus' ? 'GAME_STATUS' : 'REJOIN_GAME_START_WAITING_STATE';
    return socket.emit('message', { eventName, data: eventData });
}

export const addPlayer = (player, maxPlayer, game) => {
    const playerNo = game.players.length;
    if (playerNo < Number(maxPlayer)) {
        game.players.push(player);
    };
    return game;
}

export const startGame = async (game, io) => {
    const chipColors = ["BLUE", "PURPLE", "YELLOW"];
    const updatedPlayers = await Promise.all(game.players.map(async (player, i) => {
        player.chipColor = chipColors[i]
        const updateBalanceData = {
            id: game.id,
            bet_amount: game.betAmount,
            socket_id: player.socketId,
            user_id: player.id.split(':')[1]
        };
        const isTransactionSuccessful = await updateBalanceFromAccount(updateBalanceData, "DEBIT", io, player);
        if (isTransactionSuccessful) { player.txn_id = isTransactionSuccessful.txn_id; return player; }
        else {
            io.to(player.socketId).emit('message', {
                eventName: 'GAME_EXIT',
                data: {
                    MAX_TIME: 60,
                    messsage: 'Bet Debit Request Failed, Game Play Cancelled',
                    CURRENT_TIME: 0,
                    roomName: game.id,
                    status: true
                }
            });
            return null;
        }
    }));

    game.players = updatedPlayers.filter(player => player !== null);

    if (game.players.length < game.minPlayer) {
        await Promise.all(game.players.map(async player => {
            const updateBalanceData = {
                id: game.id,
                bet_amount: game.betAmount,
                socket_id: player.socketId,
                user_id: player.id.split(':')[1],
                txn_id: game.txn_id
            };
            await updateBalanceFromAccount(updateBalanceData, "ROLLBACK", io, player);
            io.to(player.socketId).emit('message', {
                eventName: 'GAME_EXIT',
                data: {
                    MAX_TIME: 60,
                    messsage: 'Due to some issue at opponent end, Game Play is Terminated. Your money has been rollbacked',
                    CURRENT_TIME: 0,
                    roomName: game.id,
                    status: true
                }
            });
        }));
        return removeGameFromList(game, io);
    }

    game.isStarted = true;
    await setCache(`game:${game.id}`, JSON.stringify(game));
    setTimeout(async () => await dealCards(game, io), 1000);
}

const dealCards = async (game, io) => {
    game.Deck = shuffle(game.Deck);
    const jokers = game.Deck.filter(e => e.rVal[0] === 'J').sort((a, b) => a.rVal.slice(1) - b.rVal.slice(1));
    const nonJokerCards = game.Deck.filter(e => e.rVal[0] !== 'J');

    game.boardCards = new Array(100).fill(null);

    const jokerIndices = [0, 9, 90, 99];
    jokerIndices.forEach((index, i) => {
        if (jokers[i]) {
            game.boardCards[index] = { ...jokers[i], index: index }; // Assign joker and set index
        }
    });

    let nonJokerIndex = 0;
    for (let i = 0; i < game.boardCards.length; i++) {
        if (game.boardCards[i] === null) {
            while (nonJokerIndex < nonJokerCards.length && (nonJokerCards[nonJokerIndex].index !== undefined)) {
                nonJokerIndex++;
            }
            if (nonJokerIndex < nonJokerCards.length) {
                game.boardCards[i] = { ...nonJokerCards[nonJokerIndex], index: i };
                nonJokerIndex++;
            }
        }
    }

    game.boardCards = game.boardCards.filter(card => card !== null);
    io.to(game.id).emit('message', {
        eventName: "GAME_START_WAITING_STATE",
        data: {
            maxTime: 60,
            currentTime: 0,
            message: "Game will start shortly",
            status: true,
            gameBoard: game.boardCards,
            gameData: {
                status: 'WAITING',
                currentPlayerTurnPos: game.currentPlayerTurnPos,
                winAmount: game.winAmount,
                players: game.players.map(player => {
                    let data = {
                        id : player.id,
                        name : player.name,
                        chipColor : player.chipColor
                    };
                    return data
                }),
                roomName: game.id
            }
        }
    });

    game.playerDeck = shuffle(game.playerDeck);
    for (let j = 0; j < game.players.length; j++) {
        const playerIndex = (game.currentPlayerTurnPos + j) % game.players.length;
        for (let i = 0; i < 6; i++) {
            const card = game.playerDeck.pop();
            if (card) {
                game.players[playerIndex].hand.push(card);
            }
        }
    }
    for (let player of game.players) {
        const eventData = {
            cards: player.hand,
            roomName: game.id,
            status: true
        };
        io.to(player.socketId).emit('message', {
            eventName: 'CARD_DISTRIBUTE_STATE',
            data: eventData
        });
    }
    setTimeout(() => nextTurn(game, io), 2000);
}

const checkPlayerSequences = async (games, player, io) => {
    const boardCards = games.boardCards;
    const BOARD_SIZE = 10;
    const JOKER_POSITIONS = [0, 9, 90, 99];
    const playerId = player.id;

    const board = Array.from({ length: BOARD_SIZE }, () => Array(BOARD_SIZE).fill(undefined));

    const lockedHorizontal = Array.from({ length: BOARD_SIZE }, () => Array(BOARD_SIZE).fill(false));
    const lockedVertical = Array.from({ length: BOARD_SIZE }, () => Array(BOARD_SIZE).fill(false));
    const lockedDiagonalRight = Array.from({ length: BOARD_SIZE }, () => Array(BOARD_SIZE).fill(false));
    const lockedDiagonalLeft = Array.from({ length: BOARD_SIZE }, () => Array(BOARD_SIZE).fill(false));

    const jokerUsage = {};
    JOKER_POSITIONS.forEach(pos => {
        jokerUsage[pos] = 0;
    });

    boardCards.forEach(card => {
        const row = Math.floor(card.index / BOARD_SIZE);
        const col = card.index % BOARD_SIZE;
        board[row][col] = {
            owner: JOKER_POSITIONS.includes(card.index) ? 'JOKER' : card.owner,
            isChipPlaced: JOKER_POSITIONS.includes(card.index) ? true : card.isChipPlaced,
            isChipLocked: card.isChipLocked,
            index: card.index,
        };
    });

    function getSequence(row, col, dRow, dCol, lockArray) {
        let count = 0;
        let jokersUsed = 0;
        const sequence = [];

        for (let i = 0; i < 5; i++) {
            const r = row + i * dRow;
            const c = col + i * dCol;

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
    if (sequenceCount > 0) {
        const playerIndex = games.players.findIndex(p => p.id == playerId);
        const player = games.players[playerIndex]
        player.sequenceCount += sequenceCount;
        games.players[playerIndex] = player;
        const playerSequenceCards = sequences.map(group => {
            return group.map(cardIndex => {
                games.boardCards[cardIndex].isChipLocked = true;
                return games.boardCards[cardIndex];
            });
        });

        games.sequenceData.push(playerSequenceCards);
        await setCache(`game:${games.id}`, JSON.stringify(games));
        io.to(games.id).emit('message', {
            eventName: 'SEQUENCE',
            data: {
                status: true,
                uid: player.id,
                chipColor: player.chipColor,
                sequenceData: playerSequenceCards
            }
        });
    }

    return {
        sequenceCount
    };
}

export const placeCards = async (game, boardCardPos, cardId, playerId, io) => {
    const playerIndex = game.players.findIndex(p => p.id === playerId);
    const player = game.players[playerIndex];
    if (player) {
        if (player.isEliminated) {
            return io.to(player.socketId).emit('message', { eventName: 'UserActionRequest', errorResponse: { message: 'Player is Eliminated', status: false } });
        }
        if (!player.isTurn) {
            console.log("1>>>>>>>Error>>>>>>", 'Wait for your turn');
            return io.to(player.socketId).emit('message', { eventName: 'UserActionRequest', errorResponse: { message: 'Please, Wait for your turn', status: false } });
        }

        const boardCard = game.boardCards[boardCardPos];
        if (!boardCard) return io.to(player.socketId).emit('message', { eventName: 'UserActionRequest', errorResponse: { message: 'Invalid Board Card', status: false } });
        if (boardCard.isChipLocked) return io.to(player.socketId).emit('message', { eventName: 'UserActionRequest', errorResponse: { message: 'Chip is locked', status: false } });
        const playerCard = player.hand.find(e => e.id == cardId);
        if (!playerCard) return io.to(player.socketId).emit('message', { eventName: 'UserActionRequest', errorResponse: { message: 'Invalid Player Card', status: false } });
        if (boardCard.rVal[0] == 'J') return io.to(player.socketId).emit('message', { eventName: 'UserActionRequest', errorResponse: { message: 'Chip cannot be placed on Corner Cards', status: false } });
        if ((playerCard.rVal[0] == 'H' || playerCard.rVal[0] == 'S') && playerCard.rVal.slice(1) == '11') {
            if (boardCard.owner == player.id) return io.to(player.socketId).emit('message', { eventName: 'UserActionRequest', errorResponse: { message: 'User cannot remove his owned chip', status: false } });
            if(!boardCard.owner || boardCard.owner == '') return io.to(player.socketId).emit('message', { eventName: 'UserActionRequest', errorResponse: { message: 'You can only remove occupied chips from this card', status: false } });
            game.boardCards[boardCardPos].owner = '';
            game.boardCards[boardCardPos].isChipPlaced = false;
            io.to(game.id).emit('message', {
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
            game.boardCards[boardCardPos].isChipPlaced = true;
            game.boardCards[boardCardPos].owner = player.id;
            io.to(game.id).emit('message', {
                eventName: 'CHIP_PLACED', data: {
                    uid: player.id,
                    chipColor: player.chipColor,
                    id: playerCard.id,
                    index: boardCard.index,
                    rVal: playerCard.rVal
                }
            });
            await checkPlayerSequences(game, player, io);
            if ((player.sequenceCount > 0 && game.maxPlayer == 3) || (player.sequenceCount > 1 && game.maxPlayer == 2)) {
                player.isWinner = true;
                player.winAmount = game.winAmount;
                game.players[playerIndex] = player;

                const updateBalanceData = {
                    id: game.id,
                    winning_amount: player.winAmount,
                    socket_id: player.socketId,
                    txn_id: player.txn_id,
                    user_id: player.id.split(':')[1]
                };

                const isTransactionSuccessful = await sendCreditRequest(updateBalanceData, io, player);
                if (!isTransactionSuccessful) console.log(`Credit failed for user: ${player.id} for round ${game.id}`);

                setTimeout(async () => {
                    await Promise.all(game.players.map(async p => {
                        const resultData = {
                            uid: p.id,
                            name: p.name,
                            isWinner: p.isWinner,
                            chipColor: p.chipColor,
                            betAmount: game.betAmount,
                            winAmount: p.isWinner ? p.winAmount : (0 - game.betAmount)
                        };
                        await insertSettlement({
                            bet_id: p.bet_id,
                            name: p.name,
                            winAmount: p.isWinner ? p.winAmount : 0.00,
                            status: p.isWinner ? 'WIN' : 'LOSS'
                        })
                        game.resultData.push(resultData);
                    }))
                    const eventData = {
                        status: true,
                        isDraw: false,
                        resultData: game.resultData
                    };
                    io.to(game.id).emit('message', { eventName: 'RESULT_EVENT', data: eventData });
                    await removeGameFromList(game, io);
                }, 2000);
                return;
            };
        };
        const playerOwnedChips = game.boardCards.filter(card => card.isChipPlaced);
        if (playerOwnedChips.length >= 96) {
            setTimeout(async () => {
                await Promise.all(game.players.map(async player => {
                    player.winAmount = game.betAmount - (game.betAmount * ((100 - 10) / 100));
                    const resultData = {
                        uid: player.id,
                        name: player.name,
                        chipColor: player.chipColor,
                        betAmount: game.betAmount,
                        winAmount: player.winAmount
                    };
                    await insertSettlement({
                        bet_id: player.bet_id,
                        name: player.name,
                        winAmount: player.winAmount,
                        status: 'DRAW'
                    })
                    game.resultData.push(resultData);
                    const updateBalanceData = {
                        id: game.id,
                        winning_amount: player.winAmount,
                        socket_id: player.socketId,
                        txn_id: player.txn_id,
                        user_id: player.id.split(':')[1]
                    };

                    const isTransactionSuccessful = await sendCreditRequest(updateBalanceData, io, player);
                    if (!isTransactionSuccessful) console.log(`Credit failed for user: ${player.id} for round ${game.id}`);
                }))
                const eventData = {
                    status: true,
                    isDraw: true,
                    resultData: game.resultData
                };
                io.to(game.id).emit('message', { eventName: 'RESULT_EVENT', data: eventData });
                await removeGameFromList(game, io);
            }, 2000);
            return;
        }
        player.isTurn = false;
        player.hand = player.hand.filter(card => card.id !== cardId);
        const newCard = game.playerDeck.pop();
        player.hand.push(newCard);
        game.players[playerIndex] = player;
        
        player.missedTurns = 0;
        player.skipCount = 3;

        const timerKey = `${player.id}-${game.id}`;
        if (timers.has(timerKey)) {
            clearTimeout(timers.get(timerKey));
            timers.delete(timerKey);
        }
        await setCache(`game:${game.id}`, JSON.stringify(game));
        setTimeout(() => {
            io.to(player.socketId).emit('message', {
                eventName: 'NEW_CARD', data: {
                    uid: player.id,
                    chipColor: player.chipColor,
                    newCard
                }
            });
        }, 1000);
        setTimeout(async () => await nextTurn(game, io), 2000);
    }
    return null;
}

const getCurrentPlayer = (game) => {
    return game.players[game.currentPlayerTurnPos];
}

const nextTurn = async (game, io) => {
    const isGameExist = await getCache(`game:${game.id}`);
    if(!isGameExist) return;
    const currentPlayer = (getCurrentPlayer(game));
    currentPlayer.isTurn = false;
    game.currentPlayerTurnPos = (game.currentPlayerTurnPos + 1) % game.players.length;
    const nextPlayer = game.players[game.currentPlayerTurnPos];
    nextPlayer.isTurn = true;
    const eventData = {
        MAX_TIME: 15,
        currentTime: 0,
        roomName: game.id,
        currentPlayerData: {
            id: nextPlayer.id,
            name: nextPlayer.name,
            chipColor: nextPlayer.chipColor,
            skipCount: nextPlayer.skipCount
        },
        playerData : game.players.map(player=> {
            const data = {
                id: player.id,
                skipCount : player.skipCount
            }
            return data
        }),
        currentPlayerPos: game.currentPlayerTurnPos,
        status: true,
        message: "Player turn"
    };
    io.to(game.id).emit('message', {
        eventName: 'TURN_STATE',
        data: eventData
    });

    await setCache(`game:${game.id}`, JSON.stringify(game));

    const timerKey = `${nextPlayer.id}-${game.id}`;
    if (timers.has(timerKey)) {
        clearTimeout(timers.get(timerKey));
        timers.delete(timerKey);
    }

    const timerId = setTimeout(async () => {
        nextPlayer.missedTurns += 1;
        nextPlayer.skipCount -= 1;
        console.log(nextPlayer.id, nextPlayer.missedTurns, "<<<<<<<<<2");
        if (nextPlayer.missedTurns >= 3) return dropPlayerFromGame(game, nextPlayer.id, io);
        else return await nextTurn(game, io);
    }, 15 * 1000);

    timers.set(timerKey, timerId);
};

const dropPlayerFromGame = async (game, playerId, io) => {
    console.log("DropPlayerFromGame>>>>>>>>>>>>>>", playerId);
    const playerIndex = game.players.findIndex(p => p.id === playerId);
    const player = game.players[playerIndex];
    if (!player) return io.to(player.socketId).emit('message', { eventName: 'error', data: { message: 'Invalid Player Details' } });
    game.players[playerIndex].isEliminated = true;
    game.players = game.players.filter(p => !p.isEliminated);
    const timerKey = `${player.id}-${game.id}`;
    await deleteCache(timerKey);
    if (timers.has(timerKey)) {
        clearTimeout(timers.get(timerKey));
        timers.delete(timerKey);
    }
    game.resultData.push({
        uid: player.id,
        name: player.name,
        isWinner: player.isWinner,
        chipColor: player.chipColor,
        betAmount: game.betAmount,
        winAmount: 0 - game.betAmount

    });
    await insertSettlement({
        bet_id: player.bet_id,
        name: player.name,
        winAmount: 0.00,
        status: 'LOSS'
    });
    console.log(game.players.length, "2>>>>>>")
    if (game.players.length == 1) {
        const winningPlayer = game.players[0];
        game.winner = winningPlayer;
        winningPlayer.isWinner = true;
        winningPlayer.winAmount = game.winAmount;

        game.resultData.push({
            uid: winningPlayer.id,
            name: winningPlayer.name,
            isWinner: winningPlayer.isWinner,
            chipColor: winningPlayer.chipColor,
            betAmount: game.betAmount,
            winAmount: winningPlayer.winAmount
        });

        await insertSettlement({
            bet_id: winningPlayer.bet_id,
            name: winningPlayer.name,
            winAmount: winningPlayer.winAmount,
            status: 'WIN'
        })

        const updateBalanceData = {
            id: game.id,
            winning_amount: winningPlayer.winAmount,
            socket_id: winningPlayer.socketId,
            txn_id: winningPlayer.txn_id,
            user_id: winningPlayer.id.split(':')[1]
        };

        const isTransactionSuccessful = await sendCreditRequest(updateBalanceData, io, winningPlayer);
        if (!isTransactionSuccessful) console.log(`Credit failed for user: ${winningPlayer.id} for round ${game.id}`);

        const eventData = {
            status: true,
            isDraw: false,
            resultData: game.resultData
        };
        io.to(game.id).emit('message', { eventName: 'RESULT_EVENT', data: eventData });
        await removeGameFromList(game, io);
    } else if (game.players.length > 1) {
        game.currentPlayerTurnPos = (game.currentPlayerTurnPos + 1) % game.players.length;
        await nextTurn(game, io);
    }
    return;
}

export const discardCard = async (game, playerId, cardId, io) => {
    const playerIndex = game.players.findIndex(p => p.id === playerId);
    const player = game.players[playerIndex];
    if (player.isEliminated) {
        return io.to(player.socketId).emit('message', { eventName: 'DiscardCard', data: { message: 'Player is Eliminated', status: false } });
    }
    if (!player.isTurn) {
        return io.to(player.socketId).emit('message', { eventName: 'DiscardCard', data: { message: 'Please, Wait for your turn', status: false } });
    }
    const playerCard = player.hand.find(e => e.id == cardId);
    if (!playerCard) return io.to(player.socketId).emit('message', { eventName: 'DiscardCard', data: { message: 'Invalid Player Card', status: false } });
    const boardCardsData = game.boardCards.filter(card => (card.rVal == playerCard.rVal) && !card.isChipPlaced);
    if (boardCardsData.length > 0) return io.to(player.socketId).emit('message', { eventName: 'DiscardCard', data: { message: 'Invalid Card Request', status: false } });
    player.hand = player.hand.filter(card => card.id !== cardId);
    const newCard = game.playerDeck.pop();
    player.hand.push(newCard);
    game.players[playerIndex] = player;
    await setCache(`game:${game.id}`, JSON.stringify(game));

    io.to(player.socketId).emit('message', {
        eventName: 'NEW_CARD', data: {
            uid: player.id,
            chipColor: player.chipColor,
            newCard
        }
    });
}

export const removePlayerFromGame = async (game, playerId, io, socket) => {
    socket.leave(game.id);
    socket.emit('message', {
        eventName: 'GAME_LEAVE',
        data: {}
    });
    if (game.isStarted) return await dropPlayerFromGame(game, playerId, io);
    else {
        game.players = game.players.filter(p => p.id !== playerId);
        if (game.players.length <= 0) await removeGameFromList(game, io);
        else setCache(`game:${game.id}`, JSON.stringify(game));
    }
}