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
const PLAYER_SPEED = 340; // units per second
const ATTACK_RANGE = 110;
const ATTACK_ARC_RAD = Math.PI / 2; // 90 degree swing in facing direction
const SHIELD_ARC_RAD = (2 * Math.PI) / 3; // 120 degree front-facing block
const GAME_TICK_MS = 30;
const ARENA = { width: 900, height: 520, padding: 30 };

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

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
      player1: {
        x: ARENA.padding + 70,
        y: ARENA.height / 2,
        facing: { x: 1, y: 0 },
        health: 100,
        score: 0,
        attacking: false,
        shield: this.createShieldState()
      },
      player2: {
        x: ARENA.width - ARENA.padding - 70,
        y: ARENA.height / 2,
        facing: { x: -1, y: 0 },
        health: 100,
        score: 0,
        attacking: false,
        shield: this.createShieldState()
      }
    };
    this.lastUpdate = Date.now();
    this.inputs = [
      { dx: 0, dy: 0 },
      { dx: 0, dy: 0 }
    ];
    
    player1.gameId = this.id;
    player2.gameId = this.id;
    player1.playerIndex = 0;
    player2.playerIndex = 1;
    
    // Notify players game started
    this.sendToPlayers({ type: 'gameStart', playerIndex: 0 }, 0);
    this.sendToPlayers({ type: 'gameStart', playerIndex: 1 }, 1);

    this.loop = setInterval(() => this.step(), GAME_TICK_MS);
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
      this.inputs[playerIndex] = {
        dx: Math.max(-1, Math.min(1, data.dx || 0)),
        dy: Math.max(-1, Math.min(1, data.dy || 0))
      };
    }
  }

  step() {
    const now = Date.now();
    const dt = (now - this.lastUpdate) / 1000;
    this.lastUpdate = now;

    this.refreshShieldStrength(this.state.player1.shield, now);
    this.refreshShieldStrength(this.state.player2.shield, now);

    [0, 1].forEach((index) => {
      const input = this.inputs[index];
      const playerKey = `player${index + 1}`;
      const player = this.state[playerKey];
      if (!player) return;

      const magnitude = Math.hypot(input.dx, input.dy);

      if (magnitude > 0.01) {
        const nx = input.dx / magnitude;
        const ny = input.dy / magnitude;
        player.facing = { x: nx, y: ny };

        player.x = clamp(
          player.x + nx * PLAYER_SPEED * dt,
          ARENA.padding,
          ARENA.width - ARENA.padding
        );
        player.y = clamp(
          player.y + ny * PLAYER_SPEED * dt,
          ARENA.padding,
          ARENA.height - ARENA.padding
        );
      }
    });

    this.sendToPlayers({
      type: 'gameState',
      state: this.state
    });
  }
  
  handleAttack(attackerIndex) {
    const attacker = this.state[`player${attackerIndex + 1}`];
    const defender = this.state[`player${attackerIndex === 0 ? 2 : 1}`];
    const now = Date.now();

    if (!attacker || !defender) return;

    attacker.attacking = true;
    this.refreshShieldStrength(attacker.shield, now);
    this.refreshShieldStrength(defender.shield, now);

    const dx = defender.x - attacker.x;
    const dy = defender.y - attacker.y;
    const distance = Math.hypot(dx, dy);
    const facing = attacker.facing || { x: 1, y: 0 };
    const toTarget = distance > 0 ? { x: dx / distance, y: dy / distance } : { x: 1, y: 0 };
    const angleToTarget = Math.acos(clamp(facing.x * toTarget.x + facing.y * toTarget.y, -1, 1));

    if (distance <= ATTACK_RANGE && angleToTarget <= ATTACK_ARC_RAD / 2) {
      if (defender.shield?.up && now >= defender.shield.disabledUntil) {
        const defenderShield = defender.shield;
        const attackAngleAgainstShield = (() => {
          const dxToAttacker = attacker.x - defender.x;
          const dyToAttacker = attacker.y - defender.y;
          const distToAttacker = Math.hypot(dxToAttacker, dyToAttacker) || 1;
          const shieldFacing = defender.facing || { x: -1, y: 0 };
          const towardsAttacker = { x: dxToAttacker / distToAttacker, y: dyToAttacker / distToAttacker };
          return Math.acos(clamp(shieldFacing.x * towardsAttacker.x + shieldFacing.y * towardsAttacker.y, -1, 1));
        })();

        if (attackAngleAgainstShield > SHIELD_ARC_RAD / 2) {
          defender.health = Math.max(0, defender.health - 10);
        } else if (now - defenderShield.lastRaised <= PARRY_WINDOW_MS) {
          const dxKnock = defender.x - attacker.x;
          const dyKnock = defender.y - attacker.y;
          const length = Math.hypot(dxKnock, dyKnock) || 1;
          attacker.x += (dxKnock / length) * KNOCKBACK_DISTANCE;
          attacker.y += (dyKnock / length) * KNOCKBACK_DISTANCE;
          attacker.shield.disabledUntil = now + SHIELD_LOCKOUT_MS;
        } else if (now >= defenderShield.disabledUntil) {
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
          this.state.player1.x = ARENA.padding + 70;
          this.state.player2.x = ARENA.width - ARENA.padding - 70;
          this.state.player1.y = ARENA.height / 2;
          this.state.player2.y = ARENA.height / 2;
          this.state.player1.facing = { x: 1, y: 0 };
          this.state.player2.facing = { x: -1, y: 0 };
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

  destroy() {
    clearInterval(this.loop);
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
                dx: data.dx,
                dy: data.dy
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
        game.destroy();
        games.delete(player.gameId);
      }
    }
  });
});

server.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
