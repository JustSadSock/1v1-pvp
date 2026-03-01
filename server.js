const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');
const crypto = require('crypto');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const PORT = 3000;

// Serve static files
app.use(express.static('public'));
// Also expose files under /public/* (useful when opening root index.html paths)
app.use('/public', express.static('public'));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// Game state
const games = new Map();
const waitingPlayers = [];


function angleDiff(a, b) {
  let diff = a - b;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  return Math.abs(diff);
}


class Game {
  constructor(player1, player2) {
    this.id = crypto.randomUUID();
    this.players = [player1, player2];
    this.state = {
      player1: { x: 100, y: 250, health: 100, score: 0, attacking: false, shielding: false, facing: 0 },
      player2: { x: 700, y: 250, health: 100, score: 0, attacking: false, shielding: false, facing: Math.PI }
    };
    this.lastUpdate = Date.now();
    
    player1.gameId = this.id;
    player2.gameId = this.id;
    player1.playerIndex = 0;
    player2.playerIndex = 1;
    
    // Notify players game started
    this.sendToPlayers({ type: 'gameStart', playerIndex: 0 }, 0);
    this.sendToPlayers({ type: 'gameStart', playerIndex: 1 }, 1);
    this.sendToPlayers({
      type: 'gameState',
      state: this.state
    });
  }
  
  sendToPlayers(message, playerIndex = null) {
    if (playerIndex !== null) {
      const player = this.players[playerIndex];
      if (player && player.ws.readyState === WebSocket.OPEN) {
        player.ws.send(JSON.stringify(message));
      }
    } else {
      this.players.forEach((player, idx) => {
        if (player && player.ws.readyState === WebSocket.OPEN) {
          player.ws.send(JSON.stringify(message));
        }
      });
    }
  }
  
  updatePlayer(playerIndex, data) {
    const playerKey = `player${playerIndex + 1}`;
    if (this.state[playerKey]) {
      Object.assign(this.state[playerKey], data);
      
      // Broadcast game state to all players
      this.sendToPlayers({
        type: 'gameState',
        state: this.state
      });
    }
  }
  
  handleAttack(attackerIndex) {
    const attacker = this.state[`player${attackerIndex + 1}`];
    const defender = this.state[`player${attackerIndex === 0 ? 2 : 1}`];
    
    if (!attacker || !defender) return;
    
    attacker.attacking = true;
    
    // Check if attack hits (simple distance check)
    const distance = Math.sqrt(
      Math.pow(attacker.x - defender.x, 2) + 
      Math.pow(attacker.y - defender.y, 2)
    );
    
    if (distance < 120) {
      const toDefenderAngle = Math.atan2(defender.y - attacker.y, defender.x - attacker.x);
      const slashHalfAngle = Math.PI / 3;
      const attackerFacing = typeof attacker.facing === 'number' ? attacker.facing : 0;
      const inSlash = angleDiff(attackerFacing, toDefenderAngle) <= slashHalfAngle;

      if (!inSlash) {
        this.sendToPlayers({ type: 'gameState', state: this.state });
        return;
      }

      const toAttackerAngle = Math.atan2(attacker.y - defender.y, attacker.x - defender.x);
      const shieldHalfAngle = Math.PI / 2;
      const defenderFacing = typeof defender.facing === 'number' ? defender.facing : Math.PI;
      const blocksHit = defender.shielding && angleDiff(defenderFacing, toAttackerAngle) <= shieldHalfAngle;

      const damage = blocksHit ? 0 : 10;
      defender.health = Math.max(0, defender.health - damage);
      
      if (defender.health <= 0) {
        attacker.score++;
        // Reset round
        this.state.player1.health = 100;
        this.state.player2.health = 100;
        this.state.player1.x = 100;
        this.state.player2.x = 700;
        this.state.player1.shielding = false;
        this.state.player2.shielding = false;
        this.state.player1.facing = 0;
        this.state.player2.facing = Math.PI;
        
        this.sendToPlayers({
          type: 'roundEnd',
          winner: attackerIndex,
          state: this.state
        });
      }
    }
    
    setTimeout(() => {
      attacker.attacking = false;
      this.sendToPlayers({
        type: 'gameState',
        state: this.state
      });
    }, 300);
  }
}

// WebSocket connection handler
wss.on('connection', (ws) => {
  console.log('New client connected');
  
  const player = { ws, id: crypto.randomUUID() };
  
  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message);
      
      switch (data.type) {
        case 'joinQueue':
          waitingPlayers.push(player);
          
          if (waitingPlayers.length >= 2) {
            const p1 = waitingPlayers.shift();
            const p2 = waitingPlayers.shift();
            const game = new Game(p1, p2);
            games.set(game.id, game);
          } else {
            ws.send(JSON.stringify({ type: 'waiting' }));
          }
          break;
          
        case 'move':
          if (player.gameId) {
            const game = games.get(player.gameId);
            if (game) {
              const update = {
                x: data.x,
                y: data.y
              };
              if (typeof data.facing === 'number') {
                update.facing = data.facing;
              }
              game.updatePlayer(player.playerIndex, update);
            }
          }
          break;
          
        case 'attack':
          if (player.gameId) {
            const game = games.get(player.gameId);
            if (game) {
              game.handleAttack(player.playerIndex);
            }
          }
          break;

        case 'shield':
          if (player.gameId) {
            const game = games.get(player.gameId);
            if (game) {
              game.updatePlayer(player.playerIndex, {
                shielding: Boolean(data.active)
              });
            }
          }
          break;
      }
    } catch (error) {
      console.error('Error handling message:', error);
    }
  });
  
  ws.on('close', () => {
    console.log('Client disconnected');
    
    // Remove from waiting queue
    const waitingIndex = waitingPlayers.indexOf(player);
    if (waitingIndex > -1) {
      waitingPlayers.splice(waitingIndex, 1);
    }
    
    // Handle game disconnection
    if (player.gameId) {
      const game = games.get(player.gameId);
      if (game) {
        game.sendToPlayers({ type: 'opponentDisconnected' });
        games.delete(player.gameId);
      }
    }
  });
});

server.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
