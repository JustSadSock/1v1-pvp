// Game client
let ws;
let canvas, ctx;
let playerIndex = -1;
let gameState = null;
let gameMode = null; // 'solo' | 'online'
let joystickActive = false;
let joystickPos = { x: 0, y: 0 };
let particles = [];
const desktopMode = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
const pressedKeys = new Set();
let shieldActive = false;

const soloState = {
  botAttackCooldownUntil: 0,
  botShieldUntil: 0
};

// UI elements
const menuScreen = document.getElementById('menu');
const gameScreen = document.getElementById('game');
const roundEndScreen = document.getElementById('roundEnd');
const playBtn = document.getElementById('playBtn');
const onlineBtn = document.getElementById('onlineBtn');
const attackBtn = document.getElementById('attackBtn');
const shieldBtn = document.getElementById('shieldBtn');
const statusDiv = document.getElementById('status');
const continueBtn = document.getElementById('continueBtn');
const controlsDiv = document.querySelector('.controls');
const desktopHint = document.getElementById('desktopHint');

window.addEventListener('load', () => {
  canvas = document.getElementById('gameCanvas');
  ctx = canvas.getContext('2d');

  setupJoystick();
  setupControls();

  resizeCanvas();
  window.addEventListener('resize', resizeCanvas);

  playBtn.addEventListener('click', startSoloGame);
  onlineBtn.addEventListener('click', joinOnlineGame);

  attackBtn.addEventListener('touchstart', (e) => {
    e.preventDefault();
    attack();
  });
  attackBtn.addEventListener('click', attack);

  shieldBtn.addEventListener('touchstart', (e) => {
    e.preventDefault();
    setShield(true);
  });
  shieldBtn.addEventListener('touchend', (e) => {
    e.preventDefault();
    setShield(false);
  });
  shieldBtn.addEventListener('touchcancel', (e) => {
    e.preventDefault();
    setShield(false);
  });
  shieldBtn.addEventListener('mousedown', (e) => {
    e.preventDefault();
    setShield(true);
  });

  continueBtn.addEventListener('click', () => {
    roundEndScreen.classList.add('hidden');
  });

  requestAnimationFrame(gameLoop);
});

function angleDiff(a, b) {
  let diff = a - b;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  return Math.abs(diff);
}

function resizeCanvas() {
  const hudHeight = document.querySelector('.hud')?.offsetHeight || 60;
  const controlsHeight = controlsDiv?.offsetHeight || (desktopMode ? 60 : 150);
  canvas.width = window.innerWidth;
  canvas.height = Math.max(200, window.innerHeight - hudHeight - controlsHeight);
}

function createInitialState() {
  return {
    player1: { x: 100, y: 250, health: 100, score: 0, attacking: false, shielding: false, facing: 0 },
    player2: { x: 700, y: 250, health: 100, score: 0, attacking: false, shielding: false, facing: Math.PI }
  };
}

function startSoloGame() {
  gameMode = 'solo';
  playerIndex = 0;
  shieldActive = false;
  gameState = createInitialState();
  menuScreen.classList.add('hidden');
  gameScreen.classList.remove('hidden');
  statusDiv.textContent = '';
  updateHUD();
}

function joinOnlineGame() {
  playBtn.disabled = true;
  onlineBtn.disabled = true;
  connectWebSocket();
}

function connectWebSocket() {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const host = window.location.host;
  ws = new WebSocket(`${protocol}//${host}`);

  ws.onopen = () => {
    gameMode = 'online';
    ws.send(JSON.stringify({ type: 'joinQueue' }));
    statusDiv.textContent = 'Searching for opponent...';
  };

  ws.onmessage = (event) => {
    const data = JSON.parse(event.data);
    handleServerMessage(data);
  };

  ws.onerror = () => {
    statusDiv.textContent = 'Connection error. Please refresh.';
    playBtn.disabled = false;
    onlineBtn.disabled = false;
  };

  ws.onclose = () => {
    if (gameScreen.classList.contains('hidden')) {
      statusDiv.textContent = 'Disconnected. Please try again.';
      playBtn.disabled = false;
      onlineBtn.disabled = false;
    } else if (gameMode === 'online') {
      alert('Connection lost!');
      location.reload();
    }
  };
}

function handleServerMessage(data) {
  switch (data.type) {
    case 'waiting':
      statusDiv.textContent = 'Searching for opponent...';
      break;
    case 'gameStart':
      playerIndex = data.playerIndex;
      menuScreen.classList.add('hidden');
      gameScreen.classList.remove('hidden');
      statusDiv.textContent = '';
      break;
    case 'gameState':
      gameState = data.state;
      updateHUD();
      break;
    case 'roundEnd': {
      setShield(false);
      const isWinner = data.winner === playerIndex;
      document.getElementById('roundResult').textContent = isWinner ? '🏆 YOU WIN! 🏆' : '💀 YOU LOSE 💀';
      roundEndScreen.classList.remove('hidden');
      createExplosion(canvas.width / 2, canvas.height / 2, isWinner ? '#ffd700' : '#ff0000', 50);
      break;
    }
    case 'opponentDisconnected':
      alert('Opponent disconnected!');
      location.reload();
      break;
  }
}

function setupJoystick() {
  if (desktopMode) {
    const joystickContainer = document.querySelector('.joystick-container');
    joystickContainer.classList.add('hidden');
    controlsDiv.classList.add('desktop-controls');
    desktopHint.classList.remove('hidden');
    return;
  }

  const joystick = document.getElementById('joystick');
  const joystickInner = joystick.querySelector('.joystick-inner');
  const maxDistance = 35;

  function handleStart(e) {
    e.preventDefault();
    joystickActive = true;
    handleMove(e);
  }

  function handleMove(e) {
    if (!joystickActive || !gameState) return;

    e.preventDefault();
    const touch = e.touches ? e.touches[0] : e;
    const rect = joystick.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;

    let deltaX = touch.clientX - centerX;
    let deltaY = touch.clientY - centerY;

    const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);
    if (distance > maxDistance) {
      const angle = Math.atan2(deltaY, deltaX);
      deltaX = Math.cos(angle) * maxDistance;
      deltaY = Math.sin(angle) * maxDistance;
    }

    joystickPos.x = deltaX / maxDistance;
    joystickPos.y = deltaY / maxDistance;
    joystickInner.style.transform = `translate(calc(-50% + ${deltaX}px), calc(-50% + ${deltaY}px))`;

    const speed = 5;
    movePlayer(joystickPos.x * speed, joystickPos.y * speed);
  }

  function handleEnd(e) {
    e.preventDefault();
    joystickActive = false;
    joystickPos = { x: 0, y: 0 };
    joystickInner.style.transform = 'translate(-50%, -50%)';
  }

  joystick.addEventListener('touchstart', handleStart);
  joystick.addEventListener('touchmove', handleMove);
  joystick.addEventListener('touchend', handleEnd);
  joystick.addEventListener('mousedown', handleStart);
  document.addEventListener('mousemove', handleMove);
  document.addEventListener('mouseup', handleEnd);
}

function setupControls() {
  // keyboard movement on any device with keyboard
  window.addEventListener('keydown', (event) => {
    const key = event.key.toLowerCase();
    if (['w', 'a', 's', 'd'].includes(key)) {
      event.preventDefault();
      pressedKeys.add(key);
      sendKeyboardMovement();
    }
  });

  window.addEventListener('keyup', (event) => {
    const key = event.key.toLowerCase();
    if (['w', 'a', 's', 'd'].includes(key)) {
      pressedKeys.delete(key);
    }
  });

  window.addEventListener('blur', () => {
    pressedKeys.clear();
    setShield(false);
  });

  // mouse actions only relevant for desktop
  if (desktopMode) {
    canvas.addEventListener('mousedown', (event) => {
      if (!gameState || gameScreen.classList.contains('hidden')) return;
      if (event.button === 0) {
        event.preventDefault();
        attack();
      }
      if (event.button === 2) {
        event.preventDefault();
        setShield(true);
      }
    });

    window.addEventListener('mouseup', (event) => {
      if (event.button === 2) {
        setShield(false);
      }
    });

    window.addEventListener('contextmenu', (event) => {
      if (!gameScreen.classList.contains('hidden')) {
        event.preventDefault();
      }
    });
  }

  window.addEventListener('mouseup', (event) => {
    if (event.button === 0 || event.button === 2) {
      setShield(false);
    }
  });
}

function movePlayer(deltaX, deltaY) {
  if (!gameState) return;

  const playerKey = `player${playerIndex + 1}`;
  const player = gameState[playerKey];
  if (!player) return;

  const newX = Math.max(20, Math.min(canvas.width - 20, player.x + deltaX));
  const newY = Math.max(20, Math.min(canvas.height - 20, player.y + deltaY));
  const facing = (deltaX || deltaY) ? Math.atan2(deltaY, deltaX) : player.facing;

  if (gameMode === 'online') {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'move', x: newX, y: newY, facing }));
    }
  } else {
    player.x = newX;
    player.y = newY;
    player.facing = facing;
    updateHUD();
  }
}

function sendKeyboardMovement() {
  if (!gameState || !pressedKeys.size) return;

  let deltaX = 0;
  let deltaY = 0;
  if (pressedKeys.has('w')) deltaY -= 1;
  if (pressedKeys.has('s')) deltaY += 1;
  if (pressedKeys.has('a')) deltaX -= 1;
  if (pressedKeys.has('d')) deltaX += 1;
  if (deltaX === 0 && deltaY === 0) return;

  const length = Math.hypot(deltaX, deltaY) || 1;
  const speed = 5;
  movePlayer((deltaX / length) * speed, (deltaY / length) * speed);
}

function setShield(active) {
  if (shieldActive === active) return;
  shieldActive = active;

  if (gameMode === 'online') {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'shield', active }));
    }
    return;
  }

  if (gameState) {
    gameState.player1.shielding = active;
  }
}

function resolveAttack(attackerIndex, defenderIndex) {
  if (!gameState) return;
  const attacker = gameState[`player${attackerIndex + 1}`];
  const defender = gameState[`player${defenderIndex + 1}`];
  if (!attacker || !defender) return;

  attacker.attacking = true;
  const distance = Math.hypot(attacker.x - defender.x, attacker.y - defender.y);

  if (distance < 120) {
    const toDefenderAngle = Math.atan2(defender.y - attacker.y, defender.x - attacker.x);
    const inSlash = angleDiff(attacker.facing ?? 0, toDefenderAngle) <= Math.PI / 3;

    if (inSlash) {
      const toAttackerAngle = Math.atan2(attacker.y - defender.y, attacker.x - defender.x);
      const blocksHit = defender.shielding && angleDiff(defender.facing ?? Math.PI, toAttackerAngle) <= Math.PI / 2;
      const damage = blocksHit ? 0 : 10;
      defender.health = Math.max(0, defender.health - damage);

      if (defender.health <= 0) {
        attacker.score += 1;
        gameState.player1.health = 100;
        gameState.player2.health = 100;
        gameState.player1.x = 100;
        gameState.player2.x = 700;
        gameState.player1.shielding = false;
        gameState.player2.shielding = false;
        gameState.player1.facing = 0;
        gameState.player2.facing = Math.PI;
        shieldActive = false;

        const isWinner = attackerIndex === playerIndex;
        document.getElementById('roundResult').textContent = isWinner ? '🏆 YOU WIN! 🏆' : '💀 YOU LOSE 💀';
        roundEndScreen.classList.remove('hidden');
        createExplosion(canvas.width / 2, canvas.height / 2, isWinner ? '#ffd700' : '#ff0000', 50);
      }
    }
  }

  setTimeout(() => {
    attacker.attacking = false;
  }, 300);

  updateHUD();
}

function attack() {
  if (!gameState) return;

  const playerKey = `player${playerIndex + 1}`;
  const player = gameState[playerKey];
  createExplosion(player.x, player.y, '#ff6600', 20);

  if (gameMode === 'online') {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'attack' }));
    }
    return;
  }

  resolveAttack(0, 1);
}

function updateSoloBot(timestamp) {
  if (gameMode !== 'solo' || !gameState) return;

  const bot = gameState.player2;
  const you = gameState.player1;

  const dx = you.x - bot.x;
  const dy = you.y - bot.y;
  const distance = Math.hypot(dx, dy);

  if (distance > 75) {
    const step = 2.3;
    const stepX = (dx / Math.max(distance, 1)) * step;
    const stepY = (dy / Math.max(distance, 1)) * step;
    bot.x = Math.max(20, Math.min(canvas.width - 20, bot.x + stepX));
    bot.y = Math.max(20, Math.min(canvas.height - 20, bot.y + stepY));
    bot.facing = Math.atan2(stepY, stepX);
  }

  if (you.attacking && distance < 120) {
    soloState.botShieldUntil = timestamp + 350;
  }

  bot.shielding = timestamp < soloState.botShieldUntil;

  if (distance < 100 && timestamp >= soloState.botAttackCooldownUntil) {
    resolveAttack(1, 0);
    soloState.botAttackCooldownUntil = timestamp + 700;
  }
}

function updateHUD() {
  if (!gameState) return;

  const health1 = document.getElementById('health1');
  const health2 = document.getElementById('health2');
  const score1 = document.getElementById('score1');
  const score2 = document.getElementById('score2');

  health1.style.width = `${gameState.player1.health}%`;
  health2.style.width = `${gameState.player2.health}%`;
  score1.textContent = gameState.player1.score;
  score2.textContent = gameState.player2.score;
}

function gameLoop(timestamp) {
  ctx.fillStyle = 'rgba(15, 12, 41, 0.3)';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  drawGrid();
  updateParticles();

  if (gameState) {
    sendKeyboardMovement();
    updateSoloBot(timestamp);

    drawPlayer(gameState.player1, playerIndex === 0, '#00ffff');
    drawPlayer(gameState.player2, playerIndex === 1, '#ff00ff');
  }

  requestAnimationFrame(gameLoop);
}

function drawArcEffect(x, y, radius, facing, halfAngle, color, width, blur) {
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.shadowBlur = blur;
  ctx.shadowColor = color;
  ctx.beginPath();
  ctx.arc(x, y, radius, facing - halfAngle, facing + halfAngle);
  ctx.stroke();
  ctx.shadowBlur = 0;
}

function drawGrid() {
  ctx.strokeStyle = 'rgba(0, 255, 255, 0.1)';
  ctx.lineWidth = 1;

  const gridSize = 50;

  for (let x = 0; x < canvas.width; x += gridSize) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, canvas.height);
    ctx.stroke();
  }

  for (let y = 0; y < canvas.height; y += gridSize) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(canvas.width, y);
    ctx.stroke();
  }
}

function drawPlayer(player, isYou, color) {
  if (!player) return;
  const facing = typeof player.facing === 'number' ? player.facing : 0;

  ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
  ctx.beginPath();
  ctx.ellipse(player.x, player.y + 35, 20, 5, 0, 0, Math.PI * 2);
  ctx.fill();

  const gradient = ctx.createRadialGradient(player.x, player.y, 0, player.x, player.y, 40);
  gradient.addColorStop(0, color + '80');
  gradient.addColorStop(1, 'transparent');
  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.arc(player.x, player.y, 40, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = color;
  ctx.shadowBlur = 20;
  ctx.shadowColor = color;
  ctx.beginPath();
  ctx.arc(player.x, player.y, 25, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowBlur = 0;

  ctx.strokeStyle = '#fff';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(player.x, player.y, 25, 0, Math.PI * 2);
  ctx.stroke();

  if (player.attacking) {
    drawArcEffect(player.x, player.y, 45, facing, Math.PI / 3, '#ff6600', 5, 30);
  }

  if (player.shielding) {
    drawArcEffect(player.x, player.y, 36, facing, Math.PI / 2, '#4ecbff', 6, 25);
  }

  ctx.fillStyle = '#fff';
  ctx.font = 'bold 14px Arial';
  ctx.textAlign = 'center';
  ctx.shadowBlur = 5;
  ctx.shadowColor = '#000';
  ctx.fillText(isYou ? 'YOU' : 'OPP', player.x, player.y - 40);
  ctx.shadowBlur = 0;
}

function createExplosion(x, y, color, count) {
  for (let i = 0; i < count; i++) {
    const angle = (Math.PI * 2 * i) / count;
    const speed = 2 + Math.random() * 3;
    particles.push({
      x,
      y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      color,
      life: 1,
      size: 3 + Math.random() * 5
    });
  }
}

function updateParticles() {
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];

    p.x += p.vx;
    p.y += p.vy;
    p.life -= 0.02;

    if (p.life <= 0) {
      particles.splice(i, 1);
      continue;
    }

    const alpha = Math.min(255, Math.max(0, Math.floor(p.life * 255)));
    ctx.fillStyle = p.color + alpha.toString(16).padStart(2, '0');
    ctx.shadowBlur = 10;
    ctx.shadowColor = p.color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.size * p.life, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
  }
}
