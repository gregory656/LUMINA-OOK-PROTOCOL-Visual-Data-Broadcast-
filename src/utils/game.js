import AsyncStorage from '@react-native-async-storage/async-storage';
import { getFirestore, doc, setDoc, getDoc, updateDoc, collection, query, where, getDocs, orderBy, limit, onSnapshot } from 'firebase/firestore';
import { getFirebaseApp } from './device.js';
import { DeviceManager } from './device.js';
import { SocialManager } from './social.js';
import { CommandManager } from './command.js';
import { GameSession, Player, GameState } from '../types';

export class GameManager {
  static GAMES_STORAGE_KEY = 'game_sessions';

  // Game definitions
  static GAMES = {
    ROCK_PAPER_SCISSORS: {
      id: 'rps',
      name: 'Rock Paper Scissors',
      maxPlayers: 2,
      minPlayers: 2,
      description: 'Classic game of rock, paper, scissors'
    },
    TIC_TAC_TOE: {
      id: 'ttt',
      name: 'Tic Tac Toe',
      maxPlayers: 2,
      minPlayers: 2,
      description: 'Classic 3x3 grid game'
    },
    NUMBER_GUESSING: {
      id: 'number_guess',
      name: 'Number Guessing',
      maxPlayers: 4,
      minPlayers: 2,
      description: 'Guess the secret number'
    },
    REACTION_TIME: {
      id: 'reaction',
      name: 'Reaction Time',
      maxPlayers: 6,
      minPlayers: 2,
      description: 'Test your reflexes'
    },
    TRIVIA: {
      id: 'trivia',
      name: 'Trivia Quiz',
      maxPlayers: 8,
      minPlayers: 2,
      description: 'Test your knowledge'
    }
  };

  // Create a new game session
  static async createGameSession(gameType, invitedPlayers = []) {
    try {
      const deviceId = await DeviceManager.getDeviceId();
      const game = this.GAMES[gameType.toUpperCase()];

      if (!game) {
        throw new Error('Invalid game type');
      }

      const sessionId = `game_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

      const players = [{
        deviceId: deviceId,
        profile: await SocialManager.getSocialProfile(deviceId),
        ready: true,
        joinedAt: new Date()
      }];

      const session = {
        id: sessionId,
        game: game.id,
        players: players,
        state: this.getInitialGameState(game.id),
        winner: null,
        scores: { [deviceId]: 0 },
        createdAt: new Date(),
        status: 'waiting'
      };

      const db = getFirestore(getFirebaseApp());
      await setDoc(doc(db, 'game_sessions', sessionId), session);

      // Store locally
      await this.storeGameSessionLocally(session);

      // Send invites to other players
      for (const playerId of invitedPlayers) {
        await CommandManager.sendGameInvite(game.id, playerId, {
          sessionId: sessionId,
          gameName: game.name
        });
      }

      return session;
    } catch (error) {
      console.error('Error creating game session:', error);
      throw error;
    }
  }

  // Join a game session
  static async joinGameSession(sessionId) {
    try {
      const deviceId = await DeviceManager.getDeviceId();
      const db = getFirestore(getFirebaseApp());

      const sessionRef = doc(db, 'game_sessions', sessionId);
      const sessionDoc = await getDoc(sessionRef);

      if (!sessionDoc.exists()) {
        throw new Error('Game session not found');
      }

      const session = { id: sessionDoc.id, ...sessionDoc.data() };

      if (session.status !== 'waiting') {
        throw new Error('Game has already started');
      }

      if (session.players.length >= this.GAMES[session.game.toUpperCase()].maxPlayers) {
        throw new Error('Game is full');
      }

      if (session.players.find(p => p.deviceId === deviceId)) {
        throw new Error('Already joined this game');
      }

      // Add player
      const newPlayer = {
        deviceId: deviceId,
        profile: await SocialManager.getSocialProfile(deviceId),
        ready: false,
        joinedAt: new Date()
      };

      session.players.push(newPlayer);
      session.scores[deviceId] = 0;

      await updateDoc(sessionRef, {
        players: session.players,
        scores: session.scores
      });

      // Store locally
      await this.storeGameSessionLocally(session);

      return session;
    } catch (error) {
      console.error('Error joining game session:', error);
      throw error;
    }
  }

  // Start game
  static async startGame(sessionId) {
    try {
      const deviceId = await DeviceManager.getDeviceId();
      const db = getFirestore(getFirebaseApp());

      const sessionRef = doc(db, 'game_sessions', sessionId);
      const sessionDoc = await getDoc(sessionRef);

      if (!sessionDoc.exists()) {
        throw new Error('Game session not found');
      }

      const session = { id: sessionDoc.id, ...sessionDoc.data() };

      // Check if all players are ready
      const allReady = session.players.every(p => p.ready);
      if (!allReady) {
        throw new Error('Not all players are ready');
      }

      // Check minimum players
      const game = this.GAMES[session.game.toUpperCase()];
      if (session.players.length < game.minPlayers) {
        throw new Error('Not enough players');
      }

      await updateDoc(sessionRef, {
        status: 'active',
        startedAt: new Date()
      });

      return true;
    } catch (error) {
      console.error('Error starting game:', error);
      return false;
    }
  }

  // Make a move in the game
  static async makeMove(sessionId, move) {
    try {
      const deviceId = await DeviceManager.getDeviceId();
      const db = getFirestore(getFirebaseApp());

      const sessionRef = doc(db, 'game_sessions', sessionId);
      const sessionDoc = await getDoc(sessionRef);

      if (!sessionDoc.exists()) {
        throw new Error('Game session not found');
      }

      const session = { id: sessionDoc.id, ...sessionDoc.data() };

      if (session.status !== 'active') {
        throw new Error('Game is not active');
      }

      if (!session.players.find(p => p.deviceId === deviceId)) {
        throw new Error('Not a player in this game');
      }

      // Process move based on game type
      const result = await this.processMove(session, deviceId, move);

      // Update session
      await updateDoc(sessionRef, {
        state: result.newState,
        lastMove: {
          playerId: deviceId,
          move: move,
          timestamp: new Date()
        }
      });

      // Check for winner
      if (result.winner) {
        await this.endGame(sessionId, result.winner);
      }

      return result;
    } catch (error) {
      console.error('Error making move:', error);
      throw error;
    }
  }

  // Process move based on game type
  static async processMove(session, playerId, move) {
    const gameType = session.game;

    switch (gameType) {
      case 'rps':
        return this.processRPSMove(session, playerId, move);
      case 'ttt':
        return this.processTTTMove(session, playerId, move);
      case 'number_guess':
        return this.processNumberGuessMove(session, playerId, move);
      case 'reaction':
        return this.processReactionMove(session, playerId, move);
      case 'trivia':
        return this.processTriviaMove(session, playerId, move);
      default:
        throw new Error('Unknown game type');
    }
  }

  // Rock Paper Scissors
  static processRPSMove(session, playerId, move) {
    const validMoves = ['rock', 'paper', 'scissors'];
    if (!validMoves.includes(move)) {
      throw new Error('Invalid move');
    }

    const state = session.state;
    state.moves = state.moves || {};
    state.moves[playerId] = move;

    // Check if both players have moved
    const players = session.players;
    if (players.length === 2 && state.moves[players[0].deviceId] && state.moves[players[1].deviceId]) {
      const move1 = state.moves[players[0].deviceId];
      const move2 = state.moves[players[1].deviceId];

      let winner = null;
      if (move1 === move2) {
        winner = 'tie';
      } else if (
        (move1 === 'rock' && move2 === 'scissors') ||
        (move1 === 'paper' && move2 === 'rock') ||
        (move1 === 'scissors' && move2 === 'paper')
      ) {
        winner = players[0].deviceId;
      } else {
        winner = players[1].deviceId;
      }

      return { newState: state, winner, gameOver: true };
    }

    return { newState: state, winner: null, gameOver: false };
  }

  // Tic Tac Toe
  static processTTTMove(session, playerId, move) {
    const { row, col } = move;
    const state = session.state;

    if (state.board[row][col] !== '') {
      throw new Error('Invalid move');
    }

    // Determine player symbol
    const playerIndex = session.players.findIndex(p => p.deviceId === playerId);
    const symbol = playerIndex === 0 ? 'X' : 'O';

    state.board[row][col] = symbol;
    state.currentPlayer = playerIndex === 0 ? 1 : 0;

    // Check for winner
    const winner = this.checkTTTWinner(state.board);
    const gameOver = winner || this.isTTTBoardFull(state.board);

    return { newState: state, winner: winner ? playerId : null, gameOver };
  }

  // Number Guessing
  static processNumberGuessMove(session, playerId, move) {
    const guess = parseInt(move.guess);
    const state = session.state;

    if (!state.secretNumber) {
      // First player sets the number
      state.secretNumber = guess;
      state.guesses = [];
      return { newState: state, winner: null, gameOver: false };
    }

    // Check guess
    state.guesses.push({ playerId, guess, timestamp: new Date() });

    if (guess === state.secretNumber) {
      return { newState: state, winner: playerId, gameOver: true };
    }

    return { newState: state, winner: null, gameOver: false };
  }

  // Reaction Time
  static processReactionMove(session, playerId, move) {
    const state = session.state;
    const now = Date.now();

    if (move.type === 'ready') {
      state.readyPlayers = state.readyPlayers || [];
      if (!state.readyPlayers.includes(playerId)) {
        state.readyPlayers.push(playerId);
      }

      // Start game when all ready
      if (state.readyPlayers.length === session.players.length) {
        state.gameStartTime = now + 2000; // 2 second delay
        state.phase = 'waiting';
      }
    } else if (move.type === 'react') {
      if (!state.reactions) state.reactions = {};
      if (!state.reactions[playerId]) {
        state.reactions[playerId] = now - state.gameStartTime;

        // Check if all players reacted
        if (Object.keys(state.reactions).length === session.players.length) {
          const fastest = Object.entries(state.reactions).reduce((a, b) =>
            state.reactions[a[0]] < state.reactions[b[0]] ? a : b
          );
          return { newState: state, winner: fastest[0], gameOver: true };
        }
      }
    }

    return { newState: state, winner: null, gameOver: false };
  }

  // Trivia
  static processTriviaMove(session, playerId, move) {
    const state = session.state;
    const { answer } = move;

    if (!state.currentQuestion) {
      throw new Error('No active question');
    }

    state.answers = state.answers || {};
    state.answers[playerId] = {
      answer,
      timestamp: new Date(),
      correct: answer === state.currentQuestion.correctAnswer
    };

    // Move to next question or end game
    state.questionNumber = (state.questionNumber || 0) + 1;

    if (state.questionNumber >= state.totalQuestions) {
      // Calculate final scores
      const scores = {};
      session.players.forEach(player => {
        scores[player.deviceId] = Object.values(state.answers).filter(
          a => a.playerId === player.deviceId && a.correct
        ).length;
      });

      const winner = Object.entries(scores).reduce((a, b) =>
        scores[a[0]] > scores[b[0]] ? a : b
      )[0];

      return { newState: state, winner, gameOver: true };
    } else {
      // Next question
      state.currentQuestion = this.getTriviaQuestion(state.questionNumber);
    }

    return { newState: state, winner: null, gameOver: false };
  }

  // Helper methods for games
  static getInitialGameState(gameType) {
    switch (gameType) {
      case 'rps':
        return { moves: {} };
      case 'ttt':
        return {
          board: [
            ['', '', ''],
            ['', '', ''],
            ['', '', '']
          ],
          currentPlayer: 0
        };
      case 'number_guess':
        return { guesses: [] };
      case 'reaction':
        return { phase: 'setup', readyPlayers: [] };
      case 'trivia':
        return {
          questionNumber: 0,
          totalQuestions: 5,
          answers: {},
          currentQuestion: this.getTriviaQuestion(0)
        };
      default:
        return {};
    }
  }

  static checkTTTWinner(board) {
    // Check rows, columns, diagonals
    for (let i = 0; i < 3; i++) {
      if (board[i][0] && board[i][0] === board[i][1] && board[i][1] === board[i][2]) {
        return board[i][0];
      }
      if (board[0][i] && board[0][i] === board[1][i] && board[1][i] === board[2][i]) {
        return board[0][i];
      }
    }
    if (board[0][0] && board[0][0] === board[1][1] && board[1][1] === board[2][2]) {
      return board[0][0];
    }
    if (board[0][2] && board[0][2] === board[1][1] && board[1][1] === board[2][0]) {
      return board[0][2];
    }
    return null;
  }

  static isTTTBoardFull(board) {
    return board.every(row => row.every(cell => cell !== ''));
  }

  static getTriviaQuestion(questionNumber) {
    const questions = [
      {
        question: "What is the capital of France?",
        options: ["London", "Berlin", "Paris", "Madrid"],
        correctAnswer: "Paris"
      },
      {
        question: "Which planet is known as the Red Planet?",
        options: ["Venus", "Mars", "Jupiter", "Saturn"],
        correctAnswer: "Mars"
      },
      // Add more questions...
    ];

    return questions[questionNumber % questions.length];
  }

  // End game and update stats
  static async endGame(sessionId, winner) {
    try {
      const db = getFirestore(getFirebaseApp());
      const sessionRef = doc(db, 'game_sessions', sessionId);

      const updateData = {
        status: 'completed',
        winner: winner,
        endedAt: new Date()
      };

      await updateDoc(sessionRef, updateData);

      // Update player stats
      const sessionDoc = await getDoc(sessionRef);
      const session = { id: sessionDoc.id, ...sessionDoc.data() };

      for (const player of session.players) {
        const won = player.deviceId === winner;
        await SocialManager.updateGameStats(won);
      }

      // Log game result
      await setDoc(doc(collection(db, 'game_logs')), {
        sessionId,
        gameType: session.game,
        winner,
        players: session.players.map(p => p.deviceId),
        scores: session.scores,
        endedAt: new Date()
      });

      return true;
    } catch (error) {
      console.error('Error ending game:', error);
      return false;
    }
  }

  // Get active games for player
  static async getActiveGames(deviceId = null) {
    try {
      const targetDeviceId = deviceId || await DeviceManager.getDeviceId();
      const db = getFirestore(getFirebaseApp());

      const sessionsRef = collection(db, 'game_sessions');
      const q = query(
        sessionsRef,
        where('players', 'array-contains', { deviceId: targetDeviceId }),
        where('status', 'in', ['waiting', 'active'])
      );

      const querySnapshot = await getDocs(q);
      const games = [];

      querySnapshot.forEach((doc) => {
        games.push({ id: doc.id, ...doc.data() });
      });

      return games;
    } catch (error) {
      console.error('Error getting active games:', error);
      return [];
    }
  }

  // Get game history
  static async getGameHistory(deviceId = null, limit = 20) {
    try {
      const targetDeviceId = deviceId || await DeviceManager.getDeviceId();
      const db = getFirestore(getFirebaseApp());

      const logsRef = collection(db, 'game_logs');
      const q = query(
        logsRef,
        where('players', 'array-contains', targetDeviceId),
        orderBy('endedAt', 'desc'),
        limit(limit)
      );

      const querySnapshot = await getDocs(q);
      const history = [];

      querySnapshot.forEach((doc) => {
        history.push({ id: doc.id, ...doc.data() });
      });

      return history;
    } catch (error) {
      console.error('Error getting game history:', error);
      return [];
    }
  }

  // Tournament system
  static async createTournament(gameType, maxPlayers = 8) {
    try {
      const deviceId = await DeviceManager.getDeviceId();
      const db = getFirestore(getFirebaseApp());

      const tournamentId = `tournament_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

      const tournament = {
        id: tournamentId,
        gameType,
        maxPlayers,
        players: [deviceId],
        status: 'open',
        createdAt: new Date(),
        createdBy: deviceId
      };

      await setDoc(doc(db, 'tournaments', tournamentId), tournament);

      return tournament;
    } catch (error) {
      console.error('Error creating tournament:', error);
      throw error;
    }
  }

  // Join tournament
  static async joinTournament(tournamentId) {
    try {
      const deviceId = await DeviceManager.getDeviceId();
      const db = getFirestore(getFirebaseApp());

      const tournamentRef = doc(db, 'tournaments', tournamentId);
      const tournamentDoc = await getDoc(tournamentRef);

      if (!tournamentDoc.exists()) {
        throw new Error('Tournament not found');
      }

      const tournament = tournamentDoc.data();

      if (tournament.status !== 'open') {
        throw new Error('Tournament is not open');
      }

      if (tournament.players.length >= tournament.maxPlayers) {
        throw new Error('Tournament is full');
      }

      if (tournament.players.includes(deviceId)) {
        throw new Error('Already joined this tournament');
      }

      await updateDoc(tournamentRef, {
        players: [...tournament.players, deviceId]
      });

      return true;
    } catch (error) {
      console.error('Error joining tournament:', error);
      return false;
    }
  }

  // Local storage helpers
  static async storeGameSessionLocally(session) {
    try {
      const stored = await AsyncStorage.getItem(this.GAMES_STORAGE_KEY);
      const sessions = stored ? JSON.parse(stored) : {};

      sessions[session.id] = session;
      await AsyncStorage.setItem(this.GAMES_STORAGE_KEY, JSON.stringify(sessions));
    } catch (error) {
      console.error('Error storing game session locally:', error);
    }
  }

  // Real-time game updates
  static subscribeToGameUpdates(sessionId, callback) {
    try {
      const db = getFirestore(getFirebaseApp());
      const sessionRef = doc(db, 'game_sessions', sessionId);

      return onSnapshot(sessionRef, (doc) => {
        if (doc.exists()) {
          callback({ id: doc.id, ...doc.data() });
        }
      });
    } catch (error) {
      console.error('Error subscribing to game updates:', error);
      return null;
    }
  }

  // Quick match - find or create game
  static async findQuickMatch(gameType) {
    try {
      const deviceId = await DeviceManager.getDeviceId();
      const db = getFirestore(getFirebaseApp());

      // Look for waiting games
      const sessionsRef = collection(db, 'game_sessions');
      const q = query(
        sessionsRef,
        where('game', '==', gameType),
        where('status', '==', 'waiting'),
        limit(10)
      );

      const querySnapshot = await getDocs(q);

      // Try to join existing game
      for (const doc of querySnapshot.docs) {
        const session = { id: doc.id, ...doc.data() };

        if (session.players.length < this.GAMES[gameType.toUpperCase()].maxPlayers &&
            !session.players.find(p => p.deviceId === deviceId)) {
          try {
            await this.joinGameSession(session.id);
            return session;
          } catch (error) {
            // Continue to next game
            continue;
          }
        }
      }

      // Create new game if no suitable game found
      return await this.createGameSession(gameType);
    } catch (error) {
      console.error('Error finding quick match:', error);
      return null;
    }
  }
}

export default GameManager;