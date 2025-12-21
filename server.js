const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');
const crypto = require('crypto');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const PORT = 3000;
const MAX_SHIELD_STRENGTH = 3;
const SHIELD_COOLDOWN_MS = 1000;
const PARRY_WINDOW_MS = 400;
const SHIELD_LOCKOUT_MS = 4000;
const KNOCKBACK_DISTANCE = 80;

// Serve static files
app.use(express.static('public'));
app.use('/public', express.static(path.join(__dirname, 'public')));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// Game state
const games = new Map();
const waitingPlayers = [];

class Game {
  constructor(player1, player2) {
    this.id = crypto.randomUUID();
    this.players = [player1, player2];
    this.state = {
      player1: { x: 100, y: 250, health: 100, score: 0, attacking: false, shield: this.createShieldState() },
      player2: { x: 700, y: 250, health: 100, score: 0, attacking: false, shield: this.createShieldState() }
    };
    this.lastUpdate = Date.now();
    
    player1.gameId = this.id;
    player2.gameId = this.id;
    player1.playerIndex = 0;
    player2.playerIndex = 1;
    
    // Notify players game started
    this.sendToPlayers({ type: 'gameStart', playerIndex: 0 }, 0);
    this.sendToPlayers({ type: 'gameStart', playerIndex: 1 }, 1);
  }

  createShieldState() {
    const now = Date.now();
    return {
      up: false,
      strength: MAX_SHIELD_STRENGTH,
      max: MAX_SHIELD_STRENGTH,
      lastRaised: 0,
      lastLowered: now,
      cooldownUntil: 0,
      disabledUntil: 0,
      lastRegen: now
    };
  }

  refreshShieldStrength(shield, now) {
    if (shield.up) return;

    const elapsed = now - shield.lastRegen;
    const recovered = Math.floor(elapsed / 1000);

    if (recovered > 0) {
      shield.strength = Math.min(shield.max, shield.strength + recovered);
      shield.lastRegen += recovered * 1000;
    }
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

      this.refreshShieldStrength(this.state.player1.shield, Date.now());
      this.refreshShieldStrength(this.state.player2.shield, Date.now());

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
    const now = Date.now();

    if (!attacker || !defender) return;

    attacker.attacking = true;
    this.refreshShieldStrength(attacker.shield, now);
    this.refreshShieldStrength(defender.shield, now);

    // Check if attack hits (simple distance check)
    const distance = Math.sqrt(
      Math.pow(attacker.x - defender.x, 2) +
      Math.pow(attacker.y - defender.y, 2)
    );

    if (distance < 100) {
      const defenderShield = defender.shield;
      if (
        defenderShield.up &&
        now >= defenderShield.disabledUntil
      ) {
        const parryTiming = now - defenderShield.lastRaised;
        if (parryTiming >= 0 && parryTiming <= PARRY_WINDOW_MS) {
          // Perfect parry: knock back and lock the opponent shield
          const dx = attacker.x - defender.x;
          const dy = attacker.y - defender.y;
          const length = Math.max(1, Math.sqrt(dx * dx + dy * dy));
          attacker.x += (dx / length) * KNOCKBACK_DISTANCE;
          attacker.y += (dy / length) * KNOCKBACK_DISTANCE;
          attacker.shield.disabledUntil = now + SHIELD_LOCKOUT_MS;
        } else {
          // Normal block: absorb the hit but lose durability
          defenderShield.strength = Math.max(0, defenderShield.strength - 1);

          if (defenderShield.strength === 0) {
            defenderShield.up = false;
            defenderShield.cooldownUntil = now + SHIELD_COOLDOWN_MS;
            defenderShield.lastLowered = now;
            defenderShield.lastRegen = now;
          }
        }
      } else {
        defender.health = Math.max(0, defender.health - 10);

        if (defender.health <= 0) {
          attacker.score++;
          // Reset round
          this.state.player1.health = 100;
          this.state.player2.health = 100;
          this.state.player1.x = 100;
          this.state.player2.x = 700;
          this.state.player1.shield = this.createShieldState();
          this.state.player2.shield = this.createShieldState();

          this.sendToPlayers({
            type: 'roundEnd',
            winner: attackerIndex,
            state: this.state
          });
        }
      }
    }
    
    this.sendToPlayers({
      type: 'gameState',
      state: this.state
    });

    setTimeout(() => {
      attacker.attacking = false;
      this.sendToPlayers({
        type: 'gameState',
        state: this.state
      });
    }, 300);
  }

  toggleShield(playerIndex, up) {
    const playerKey = `player${playerIndex + 1}`;
    const player = this.state[playerKey];
    if (!player) return;

    const shield = player.shield;
    const now = Date.now();

    this.refreshShieldStrength(shield, now);

    if (up) {
      if (now < shield.cooldownUntil || now < shield.disabledUntil) return;
      shield.up = true;
      shield.lastRaised = now;
    } else {
      if (!shield.up) return;
      shield.up = false;
      shield.lastLowered = now;
      shield.cooldownUntil = now + SHIELD_COOLDOWN_MS;
      shield.lastRegen = now;
    }

    this.sendToPlayers({
      type: 'gameState',
      state: this.state
    });
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
              game.updatePlayer(player.playerIndex, {
                x: data.x,
                y: data.y
              });
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
            if (game && typeof data.up === 'boolean') {
              game.toggleShield(player.playerIndex, data.up);
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
