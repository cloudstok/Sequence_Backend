import { generateDeck, shuffle } from './deck.js';
import { removeGameFromList } from '../services/gameEvents.js';
import { generateDeckForPlayer } from './player-deck.js';
import { deleteCache, getCache, setCache } from '../utilities/redis-connection.js';
import { sendCreditRequest, updateBalanceFromAccount } from './player.js';
import { insertSettlement } from './db-data/bets-db.js';
const timers = new Map();

const clearTimer = (playerId, gameId) => {
    const timerKey = `${playerId}-${gameId}`;
    if (timers.has(timerKey)) {
        clearTimeout(timers.get(timerKey));
        timers.delete(timerKey);
    }
}

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
        sequenceDataIndex: [[]],
        resultData: [],
    };
    return gameData;
}

export const updateMeRequest = async (game, playerId, socket, event = 'reconnection') => {
    try {
        const playerIndex = game.players.findIndex(p => p.id === playerId);
        if (playerIndex === -1) return socket.emit('message', { eventName: 'error', data: { message: 'Invalid Player ID' } });
        const player = game.players[playerIndex];
        if (!game.isStarted) {
            const waitingData = {
                maxTime: 60,
                maxDateTime: Date.now(),
                current_time: 60 - ((Date.now() - game.gameStartTime) / 1000),
                message: "Please wait for other players to join game",
                roomName: game.id,
                status: true
            };
            return socket.emit('message', {
                eventName: 'REJOIN_PLAYER_WAITING_STATE',
                data: waitingData
            });
        }

        player.socketId = socket.id;
        socket.join(game.id);
        game.players[playerIndex] = player;
        await setCache(`game:${game.id}`, JSON.stringify(game));

        const gameData = {
            roomName: game.id,
            currentPlayerTurnPos: game.currentPlayerTurnPos,
            winAmount: game.winAmount,
            sequenceData: game.sequenceData,
            players: game.players.map(({ id, name, chipColor, skipCount }) => ({
                id, name, chipColor, skipCount
            }))
        };

        const currentPlayerData = {
            id: player.id,
            name: player.name,
            chipColor: player.chipColor,
            hand: player.hand.map(({ id, rVal }) => ({ id, rVal }))
        };

        const turnData = {
            remainingTurnsTime: 18,
            turnPlayerData: game.players[game.currentPlayerTurnPos].id
        };

        const eventData = {
            gameData,
            gameBoard: game.boardCards,
            currentPlayerData,
            turnData
        };

        const eventName = event == 'gameStatus' ? 'GAME_STATUS' : 'REJOIN_GAME_START_WAITING_STATE';
        return socket.emit('message', { eventName, data: eventData });
    } catch (err) {
        console.error("Error in updateMeRequest>>", err);
    }
}

export const addPlayer = (player, maxPlayer, game) => {
    try {
        const colors = ["BLUE", "PURPLE", "YELLOW"];
        const assignedColors = game.players.map(p => p.chipColor);
        const availableColor = colors.find(color => !assignedColors.includes(color));

        if (game.players.length < Number(maxPlayer) && availableColor) {
            player.chipColor = availableColor;
            game.players.push(player);
        };

        return game;
    } catch (err) {
        console.error("Err while adding player to game>>", err);
    }
}

const sendGameExitMessage = (io, player, roomId, message) => {
    io.to(player.socketId).emit('message', {
        eventName: 'GAME_EXIT',
        data: {
            MAX_TIME: 60,
            messsage: message,
            CURRENT_TIME: 0,
            roomName: roomId,
            status: true
        }
    });
};

const rollbackTransaction = async (io, player, game) => {
    const rollbackData = {
        id: game.id,
        bet_amount: game.betAmount,
        socket_id: player.socketId,
        user_id: player.id.split(':')[1],
        txn_id: player.txn_id
    };

    await updateBalanceFromAccount(rollbackData, "ROLLBACK", io, player);

    sendGameExitMessage(io, player, game.id,
        'Due to some issue at opponent end, Game Play is Terminated. Your money has been rollbacked');
};

export const startGame = async (game, io) => {
    const updatedPlayers = await Promise.all(game.players.map(async (player) => {
        const updateBalanceData = {
            id: game.id,
            bet_amount: game.betAmount,
            socket_id: player.socketId,
            user_id: player.id.split(':')[1]
        };
        const isTransactionSuccessful = await updateBalanceFromAccount(updateBalanceData, "DEBIT", io, player);
        if (isTransactionSuccessful) {
            player.txn_id = isTransactionSuccessful.txn_id;
            return player;
        } else {
            sendGameExitMessage(io, player, game.id, 'Bet Debit Request Failed, Game Play Cancelled');
            return null;
        }
    }));

    game.players = updatedPlayers.filter(player => player !== null);

    if (game.players.length < game.maxPlayer) {
        await Promise.all(game.players.map(async player => rollbackTransaction(io, player, game)));
        return removeGameFromList(game, io);
    }

    game.isStarted = true;
    await setCache(`game:${game.id}`, JSON.stringify(game));
    setTimeout(async () => {
        const cachedGame = await getCache(`game:${game.id}`);
        if (!cachedGame) {
            console.log(`Game ${game.id} has been deleted. Aborting dealCards.`);
            return;
        }
        dealCards(JSON.parse(cachedGame), io);
    }, 1000);
};

const emitGameStartMessage = (game, io) => {
    const gameData = {
        status: 'WAITING',
        currentPlayerTurnPos: game.currentPlayerTurnPos,
        winAmount: game.winAmount,
        players: game.players.map(({ id, name, chipColor }) => ({
            id, name, chipColor
        })),
        roomName: game.id
    };

    io.to(game.id).emit('message', {
        eventName: "GAME_START_WAITING_STATE",
        data: {
            maxTime: 60,
            currentTime: 0,
            message: "Game will start shortly",
            status: true,
            gameBoard: game.boardCards,
            gameData
        }
    });
};

const dealCards = async (game, io) => {
    game.Deck = shuffle(game.Deck);
    const jokers = game.Deck.filter(e => e.rVal[0] === 'J').sort((a, b) => a.rVal.slice(1) - b.rVal.slice(1));
    const nonJokerCards = game.Deck.filter(e => e.rVal[0] !== 'J');

    game.boardCards = new Array(100).fill(null);

    const jokerIndices = [0, 9, 90, 99];
    jokerIndices.forEach((index, i) => {
        if (jokers[i]) {
            game.boardCards[index] = { ...jokers[i], index: index };
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

    emitGameStartMessage(game, io); //Emit Board and Game Data

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
    };

    await setCache(`game:${game.id}`, JSON.stringify(game));
    setTimeout(async () => {
        const cachedGame = await getCache(`game:${game.id}`);
        if (!cachedGame) {
            console.log(`Game ${game.id} has been deleted. Aborting turn events.`);
            return;
        }
        await nextTurn(JSON.parse(cachedGame), io)
    }, 2000);
}

const checkPlayerSequences = async (games, player, io) => {
    const boardCards = games.boardCards;
    const BOARD_SIZE = 10;
    const JOKER_POSITIONS = [0, 9, 90, 99];
    const playerId = player.id;

    const board = Array.from({ length: BOARD_SIZE }, () => Array(BOARD_SIZE).fill(undefined));
    const lockedChips = {};
    const playerSequences = new Set();

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
        if (card.isChipLocked) {
            lockedChips[card.index] = card.owner;
        }
    });

    function getSequence(row, col, dRow, dCol, lockArray) {
        let count = 0;
        let jokersUsed = 0;
        const sequence = [];
        let overlappingSequenceCount = 0;
        let intersectingChipCount = 0;

        for (let i = 0; i < 5; i++) {
            const r = row + i * dRow;
            const c = col + i * dCol;

            if (r < 0 || r >= BOARD_SIZE || c < 0 || c >= BOARD_SIZE) return null;

            const cell = board[r][c];
            if (!cell || (!cell.isChipPlaced && cell.owner !== 'JOKER')) return null;

            if (cell.isChipLocked) {
                const lockedOwner = lockedChips[cell.index];
                if (lockedOwner && lockedOwner !== playerId) return null;

                intersectingChipCount++;
                for (const seq of playerSequences) {
                    if (seq.includes(cell.index)) {
                        overlappingSequenceCount++;
                        break;
                    }
                }
            }

            if (lockArray[r][c]) continue;

            if (cell.owner === playerId) {
                count++;
                sequence.push(cell.index);
            } else if (cell.owner === 'JOKER' || JOKER_POSITIONS.includes(cell.index)) {
                if (jokerUsage[cell.index] >= 3) return null;
                jokersUsed++;
                sequence.push(cell.index);
            } else {
                return null;
            }
        }

        if (intersectingChipCount > 1 || overlappingSequenceCount > 1) return null;

        if (count + jokersUsed === 5) {
            for (let i = 0; i < 5; i++) {
                const r = row + i * dRow;
                const c = col + i * dCol;
                lockArray[r][c] = true;

                if (board[r][c].owner !== 'JOKER') {
                    lockedChips[board[r][c].index] = playerId;
                }
                if (JOKER_POSITIONS.includes(board[r][c].index)) {
                    jokerUsage[board[r][c].index]++;
                }
            }
            return sequence;
        }
        return null;
    };

    let sequenceCount = 0;
    const sequences = [];

    for (let row = 0; row < BOARD_SIZE; row++) {
        for (let col = 0; col < BOARD_SIZE; col++) {
            if (!board[row][col]) continue;

            const horizontalSeq = getSequence(row, col, 0, 1, lockedHorizontal);
            if (horizontalSeq && !playerSequences.has(horizontalSeq.toString())) {
                sequenceCount++;
                sequences.push(horizontalSeq);
                playerSequences.add(horizontalSeq.toString());
            }

            const verticalSeq = getSequence(row, col, 1, 0, lockedVertical);
            if (verticalSeq && !playerSequences.has(verticalSeq.toString())) {
                sequenceCount++;
                sequences.push(verticalSeq);
                playerSequences.add(verticalSeq.toString());
            }

            const diagonalRightSeq = getSequence(row, col, 1, 1, lockedDiagonalRight);
            if (diagonalRightSeq && !playerSequences.has(diagonalRightSeq.toString())) {
                sequenceCount++;
                sequences.push(diagonalRightSeq);
                playerSequences.add(diagonalRightSeq.toString());
            }

            const diagonalLeftSeq = getSequence(row, col, 1, -1, lockedDiagonalLeft);
            if (diagonalLeftSeq && !playerSequences.has(diagonalLeftSeq.toString())) {
                sequenceCount++;
                sequences.push(diagonalLeftSeq);
                playerSequences.add(diagonalLeftSeq.toString());
            }
        }
    }


    function removeArraysIfExist(sourceArray, arraysToRemove) {
        return sourceArray.filter(arr => !arraysToRemove.some(removeArr => arraysAreEqual(arr, removeArr)));
    }

    function arraysAreEqual(arr1, arr2) {
        if (arr1.length !== arr2.length) return false;

        for (let i = 0; i < arr1.length; i++) {
            if (arr1[i] !== arr2[i]) return false;
        }

        return true;
    }

    if (sequences.length > 0) {
        const filterSequences = removeArraysIfExist(sequences, games.sequenceDataIndex);
        sequenceCount = filterSequences.length;
    }

    if (sequenceCount > 0) {
        const playerIndex = games.players.findIndex(p => p.id === playerId);
        games.players[playerIndex].sequenceCount += sequenceCount;
        sequenceCount = games.players[playerIndex].sequenceCount;

        const playerSequenceCards = sequences.map(group => {
            games.sequenceDataIndex.push(group);
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
                sequenceData: playerSequenceCards,
            },
        });
    }

    return {
        sequenceCount
    };
};

const handleGameEnd = async (game, io) => {
    setTimeout(async () => {
        await Promise.all(game.players.map(async (player) => {
            const resultData = {
                uid: player.id,
                name: player.name,
                isWinner: player.isWinner,
                chipColor: player.chipColor,
                betAmount: game.betAmount,
                winAmount: player.isWinner ? player.winAmount : -game.betAmount
            };
            await insertSettlement({
                bet_id: player.bet_id,
                name: player.name,
                winAmount: player.isWinner ? player.winAmount : 0.0,
                status: player.isWinner ? 'WIN' : 'LOSS'
            });
            game.resultData.push(resultData);
            clearTimer(player.id, game.id);
        }));

        const eventData = {
            status: true,
            isDraw: false,
            resultData: game.resultData
        };

        io.to(game.id).emit('message', { eventName: 'RESULT_EVENT', data: eventData });
        await removeGameFromList(game, io);
    }, 2000);
};

const handleDraw = async (game, io) => {
    setTimeout(async () => {
        await Promise.all(game.players.map(async (player) => {
            player.winAmount = game.betAmount * 0.9;
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
            });
            game.resultData.push(resultData);

            const updateBalanceData = {
                id: game.id,
                winning_amount: Number(player.winAmount).toFixed(2),
                socket_id: player.socketId,
                txn_id: player.txn_id,
                user_id: player.id.split(':')[1]
            };

            const isTransactionSuccessful = await sendCreditRequest(updateBalanceData, io, player);
            if (!isTransactionSuccessful) console.log(`Credit failed for user: ${player.id} for round ${game.id}`);
            clearTimer(player.id, game.id);
        }));

        const eventData = {
            status: true,
            isDraw: true,
            resultData: game.resultData
        };

        io.to(game.id).emit('message', { eventName: 'RESULT_EVENT', data: eventData });
        await removeGameFromList(game, io);
    }, 2000);
};

export const placeCards = async (game, boardCardPos, cardId, playerId, io) => {
    try {
        const playerIndex = game.players.findIndex(p => p.id === playerId);
        if (playerIndex === -1) return io.to(game.id).emit('message', { eventName: 'error', data: { message: 'Invalid Player Details' } });
        const player = game.players[playerIndex];

        const sendError = (message) => {
            io.to(player.socketId).emit('message', { eventName: 'UserActionRequest', errorResponse: { message, status: false } });
        };

        if (player.isEliminated) return sendError('Player is Eliminated');
        if (!player.isTurn) return sendError('Please, Wait for your turn');

        const boardCard = game.boardCards[boardCardPos];
        if (!boardCard) return sendError('Invalid Board Card');
        if (boardCard.isChipLocked) return sendError('Chip is locked');

        const playerCard = player.hand.find(e => e.id == cardId);
        if (!playerCard) return sendError('Invalid Player Card');
        if (boardCard.rVal[0] == 'J') return sendError('Chip cannot be placed on Corner Cards');

        const handleJackCard = () => {
            if (boardCard.owner == player.id) return sendError('User cannot remove his owned chip');
            if (!boardCard.owner || boardCard.owner == '') return sendError('You can only remove occupied chips from this card');

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
        };

        const handleChipPlacement = async () => {
            if (boardCard.isChipPlaced) return sendError('Chip Already placed on Card');

            const isCardJack = (['D', 'C'].includes(playerCard.rVal[0]) && playerCard.rVal.slice(1) === '11');
            if ((boardCard.rVal.slice(1) != playerCard.rVal.slice(1)) && !isCardJack) {
                return sendError('Chip cannot be placed on given position')
            };

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

            const isWinner = (player.sequenceCount > 0 && game.maxPlayer === 3) || (player.sequenceCount > 1 && game.maxPlayer === 2);

            if (isWinner) {
                player.isWinner = true;
                player.winAmount = game.winAmount;
                game.players[playerIndex] = player;

                const updateBalanceData = {
                    id: game.id,
                    winning_amount: Number(player.winAmount).toFixed(2),
                    socket_id: player.socketId,
                    txn_id: player.txn_id,
                    user_id: player.id.split(':')[1]
                };

                const isTransactionSuccessful = await sendCreditRequest(updateBalanceData, io, player);
                if (!isTransactionSuccessful) console.log(`Credit failed for user: ${player.id} for round ${game.id}`);

                handleGameEnd(game, io);
                return;
            }
        };

        if (['H', 'S'].includes(playerCard.rVal[0]) && playerCard.rVal.slice(1) === '11') {
            handleJackCard();
        } else {
            await handleChipPlacement();
        }

        const playerOwnedChips = game.boardCards.filter(card => card.isChipPlaced).length;

        if (playerOwnedChips >= 96) {
            handleDraw(game, io);
            return;
        }

        player.isTurn = false;
        player.hand = player.hand.filter(card => card.id != cardId);
        const newCard = game.playerDeck.pop();
        // const newCard = game.playerDeck.find(card => card.rVal == 'D11');
        player.hand.push(newCard);
        player.missedTurns = 0;
        player.skipCount = 3;
        game.players[playerIndex] = player;

        clearTimer(player.id, game.id);

        await setCache(`game:${game.id}`, JSON.stringify(game));
        setTimeout(() => {
            io.to(player.socketId).emit('message', {
                eventName: 'NEW_CARD', data: {
                    uid: player.id,
                    chipColor: player.chipColor,
                    newCard,
                    oldCard: playerCard
                }
            });
        }, 1000);
        setTimeout(async () => await nextTurn(game, io), 2000);
    } catch (err) {
        console.error("Error in Place cards>>", err);
    }
};

const getCurrentPlayer = game => game.players[game.currentPlayerTurnPos];

const emitTurnState = (game, io, nextPlayer) => {
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
        playerData: game.players.map(({ id, skipCount }) => ({ id, skipCount })),
        currentPlayerPos: game.currentPlayerTurnPos,
        status: true,
        message: "Player turn"
    };

    io.to(game.id).emit('message', {
        eventName: 'TURN_STATE',
        data: eventData
    });
};

const nextTurn = async (game, io) => {
    try {
        const currentPlayer = getCurrentPlayer(game);
        currentPlayer.isTurn = false;
        game.currentPlayerTurnPos = (game.currentPlayerTurnPos + 1) % game.players.length;
        const nextPlayer = game.players[game.currentPlayerTurnPos];
        nextPlayer.isTurn = true;

        emitTurnState(game, io, nextPlayer);

        const timerKey = `${nextPlayer.id}-${game.id}`;
        clearTimer(nextPlayer.id, game.id);

        const timerId = setTimeout(async () => {
            const cachedGameGame = await getCache(`game:${game.id}`);
            if (!cachedGameGame) {
                console.log(`Game with ID ${game.id} not found, Aborting turns`);
                return;
            };
            const currentGame = JSON.parse(cachedGameGame);
            const currentPlayer = getCurrentPlayer(currentGame);
            currentPlayer.missedTurns += 1;
            currentPlayer.skipCount -= 1;
            currentGame.players[currentGame.currentPlayerTurnPos] = currentPlayer;
            await setCache(`game:${currentGame.id}`, JSON.stringify(currentGame));
            if (currentPlayer.missedTurns >= 3) return dropPlayerFromGame(currentGame, currentPlayer.id, io);
            else {
                await nextTurn(currentGame, io)
            };
        }, 15 * 1000);

        timers.set(timerKey, timerId);
        await setCache(`game:${game.id}`, JSON.stringify(game));
    } catch (err) {
        console.error(`Err while getting next player turn`, err);
    }
};

const dropPlayerFromGame = async (game, playerId, io) => {
    try {
        const playerIndex = game.players.findIndex(p => p.id === playerId);
        if (playerIndex === -1) return io.to(game.id).emit('message', { eventName: 'error', data: { message: 'Invalid Player Details' } });
        const player = game.players[playerIndex];
        player.isEliminated = true;

        clearTimer(player.id, game.id); //Remove timer if exists

        game.resultData.push({
            uid: player.id,
            name: player.name,
            isWinner: player.isWinner,
            chipColor: player.chipColor,
            betAmount: game.betAmount,
            winAmount: -game.betAmount

        });

        //Insert into DB
        await insertSettlement({
            bet_id: player.bet_id,
            name: player.name,
            winAmount: 0.00,
            status: 'LOSS'
        });

        game.players = game.players.filter(player => player.id !== playerId);
        if (game.currentPlayerTurnPos >= playerIndex) {
            game.currentPlayerTurnPos = (game.currentPlayerTurnPos - 1 + game.players.length) % game.players.length;
        }

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
                winning_amount: Number(winningPlayer.winAmount).toFixed(2),
                socket_id: winningPlayer.socketId,
                txn_id: winningPlayer.txn_id,
                user_id: winningPlayer.id.split(':')[1]
            };

            const isTransactionSuccessful = await sendCreditRequest(updateBalanceData, io, winningPlayer);
            if (!isTransactionSuccessful) console.log(`Credit failed for user: ${winningPlayer.id} for round ${game.id}`);

            clearTimer(winningPlayer.id, game.id);

            const eventData = {
                status: true,
                isDraw: false,
                resultData: game.resultData
            };

            io.to(game.id).emit('message', { eventName: 'RESULT_EVENT', data: eventData });
            await removeGameFromList(game, io);
        } else {
            await setCache(`game:${game.id}`, JSON.stringify(game));
            if (player.isTurn) {
                await nextTurn(game, io)
            }
        }
    } catch (err) {
        console.error(`Error dropping player from game:`, err);
    };
}

export const discardCard = async (game, playerId, cardId, io) => {
    try {
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
        player.hand = player.hand.filter(card => card.id != cardId);
        const newCard = game.playerDeck.pop();
        player.hand.push(newCard);
        game.players[playerIndex] = player;
        await setCache(`game:${game.id}`, JSON.stringify(game));

        io.to(player.socketId).emit('message', {
            eventName: 'NEW_CARD', data: {
                uid: player.id,
                chipColor: player.chipColor,
                newCard,
                oldCard: playerCard
            }
        });
    } catch (err) {
        console.error(`Error in discardCard:`, err);
    }
}

export const removePlayerFromGame = async (game, playerId, io, socket) => {
    try {
        await deleteCache(`PG:${playerId}`);
        socket.leave(game.id);
        socket.emit('message', {
            eventName: 'GAME_LEAVE',
            data: {}
        });
        if (game.isStarted) {
            await dropPlayerFromGame(game, playerId, io)
        } else {
            clearTimer(playerId, game.id);
            game.players = game.players.filter(p => p.id !== playerId);
            if (game.players.length === 0) {
                await removeGameFromList(game, io)
            } else {
                await setCache(`game:${game.id}`, JSON.stringify(game));
                const eventData = { maxTime: 60, maxDateTime: Date.now(), current_time: 60 - ((Date.now() - game.gameStartTime) / 1000), message: "Please wait for other players to join game", roomName: game.id, status: true };
                io.to(game.id).emit('message', { eventName: 'PLAYER_WAITING_STATE', data: eventData });
                const updatePlayerEventData = { PLAYER: game.players.map(({ id, name, chipColor }) => ({
                    id, name, chipColor
                })), roomStatus: true, message: "Players List", roomName: game.id, status: true };
                io.to(game.id).emit('message', { eventName: 'UPDATE_PLAYER_EVENT', data: updatePlayerEventData });
            };
        }
    } catch (err) {
        console.error(`Error in removePlayerFromGame:`, err);
    }
}