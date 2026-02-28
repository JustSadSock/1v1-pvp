// Game client
let ws;
let canvas, ctx;
let playerIndex = -1;
let gameState = null;
let renderState = null;
let joystickActive = false;
let joystickPos = { x: 0, y: 0 };
let particles = [];
let wsHost = null;
let lastMoveSent = 0;
let lastMoveDir = { x: 0, y: 0 };
let playMode = 'online';

const ATTACK_ARC_RAD = Math.PI / 2;
const SHIELD_ARC_RAD = (2 * Math.PI) / 3;
const cloneState = (state) => JSON.parse(JSON.stringify(state));

function enableMenuButtons() {
  playBtn.disabled = false;
  soloBtn.disabled = false;
}

// UI elements
const menuScreen = document.getElementById('menu');
const gameScreen = document.getElementById('game');
const roundEndScreen = document.getElementById('roundEnd');
const playBtn = document.getElementById('playBtn');
const soloBtn = document.getElementById('soloBtn');
const attackBtn = document.getElementById('attackBtn');
const shieldBtn = document.getElementById('shieldBtn');
const statusDiv = document.getElementById('status');
const continueBtn = document.getElementById('continueBtn');
const fullscreenBtn = document.getElementById('fullscreenBtn');

// Initialize
window.addEventListener('load', () => {
  canvas = document.getElementById('gameCanvas');
  ctx = canvas.getContext('2d');

  updateUiScale();
  resizeCanvas();
  window.addEventListener('resize', resizeCanvas);

  playBtn.addEventListener('click', () => joinGame('online'));
  soloBtn.addEventListener('click', () => joinGame('solo'));
  attackBtn.addEventListener('touchstart', (e) => {
    e.preventDefault();
    attack();
  });
  attackBtn.addEventListener('click', attack);

  const raiseShieldHandler = (e) => {
    e.preventDefault();
    raiseShield();
  };
  const lowerShieldHandler = (e) => {
    e.preventDefault();
    lowerShield();
  };
  shieldBtn.addEventListener('touchstart', raiseShieldHandler);
  shieldBtn.addEventListener('touchend', lowerShieldHandler);
  shieldBtn.addEventListener('touchcancel', lowerShieldHandler);
  shieldBtn.addEventListener('mousedown', raiseShieldHandler);
  shieldBtn.addEventListener('mouseup', lowerShieldHandler);
  shieldBtn.addEventListener('mouseleave', lowerShieldHandler);

  continueBtn.addEventListener('click', () => {
    roundEndScreen.classList.add('hidden');
  });

  setupJoystick();
  fullscreenBtn.addEventListener('click', toggleFullscreen);
  document.addEventListener('fullscreenchange', updateFullscreenIcon);

  // Start animation loop
  requestAnimationFrame(gameLoop);
});

function resizeCanvas() {
  updateUiScale();
  const hudHeight = document.querySelector('.hud')?.offsetHeight || 0;
  const controlsHeight = document.querySelector('.controls')?.offsetHeight || 0;
  canvas.width = window.innerWidth;
  canvas.height = Math.max(200, window.innerHeight - hudHeight - controlsHeight - 10);
}

function updateUiScale() {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const baseWidth = 1200;
  const baseHeight = 720;
  const rawScale = Math.min(vw / baseWidth, vh / baseHeight);
  const scale = Math.max(0.55, Math.min(1.25, rawScale));

  const rootStyle = document.documentElement.style;
  const px = (value) => `${Math.round(value * scale)}px`;

  rootStyle.setProperty('--ui-scale', scale.toFixed(3));
  rootStyle.setProperty('--font-scale', scale.toFixed(3));
  rootStyle.setProperty('--controls-height', px(150));
  rootStyle.setProperty('--control-padding', px(30));
  rootStyle.setProperty('--control-gap', px(20));
  rootStyle.setProperty('--joystick-size', px(140));
  rootStyle.setProperty('--joystick-inner-size', px(60));
  rootStyle.setProperty('--action-button-size', px(90));
  rootStyle.setProperty('--fab-size', px(52));
  rootStyle.setProperty('--hud-padding', px(20));
}

function connectWebSocket() {
  const { url, host } = buildWebSocketUrl();
  wsHost = host;
  statusDiv.textContent = `Connecting to ${host} (${playMode})...`;

  ws = new WebSocket(url);

  ws.onopen = () => {
    console.log('Connected to server');
    const joinType = playMode === 'solo' ? 'singlePlay' : 'joinQueue';
    ws.send(JSON.stringify({ type: joinType }));
    statusDiv.textContent =
      playMode === 'solo' ? 'Spawning practice bot...' : 'Searching for opponent...';
  };
  
  ws.onmessage = (event) => {
    const data = JSON.parse(event.data);
    handleServerMessage(data);
  };
  
  ws.onerror = (error) => {
    console.error('WebSocket error:', error);
    statusDiv.textContent = `Connection error to ${wsHost}. Please refresh.`;
    enableMenuButtons();
  };

  ws.onclose = () => {
    console.log('Disconnected from server');
    if (gameScreen.classList.contains('hidden')) {
      statusDiv.textContent = 'Disconnected. Please try again.';
      enableMenuButtons();
    } else {
      alert('Connection lost!');
      location.reload();
    }
  };
}

function buildWebSocketUrl() {
  const queryHost = new URL(window.location.href).searchParams.get('server');
  const configuredHost = (queryHost || window.SERVER_HOST || '').trim();

  // Accept full websocket or http(s) URLs, or a bare host[:port].
  const raw = configuredHost || window.location.host;
  if (raw.startsWith('ws://') || raw.startsWith('wss://')) {
    return { url: raw, host: raw.replace(/^wss?:\/\//, '') };
  }

  if (raw.startsWith('http://') || raw.startsWith('https://')) {
    const wsProtocol = raw.startsWith('https://') ? 'wss://' : 'ws://';
    return { url: `${wsProtocol}${raw.replace(/^https?:\/\//, '')}`, host: raw.replace(/^https?:\/\//, '') };
  }

  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return { url: `${protocol}//${raw}`, host: raw };
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
      if (!renderState) {
        renderState = cloneState(gameState);
      }
      updateHUD();
      break;
      
    case 'roundEnd':
      const isWinner = data.winner === playerIndex;
      document.getElementById('roundResult').textContent = 
        isWinner ? '🏆 YOU WIN! 🏆' : '💀 YOU LOSE 💀';
      roundEndScreen.classList.remove('hidden');
      
      // Create victory/defeat particles
      createExplosion(canvas.width / 2, canvas.height / 2, isWinner ? '#ffd700' : '#ff0000', 50);
      break;
      
    case 'opponentDisconnected':
      alert('Opponent disconnected!');
      location.reload();
      break;
  }
}

function joinGame(mode = 'online') {
  playMode = mode;
  playBtn.disabled = true;
  soloBtn.disabled = true;
  connectWebSocket();
}

function toggleFullscreen() {
  if (!document.fullscreenElement) {
    const element = document.documentElement;
    const request =
      element.requestFullscreen ||
      element.webkitRequestFullscreen ||
      element.mozRequestFullScreen ||
      element.msRequestFullscreen;
    if (request) request.call(element);
  } else {
    const exit =
      document.exitFullscreen ||
      document.webkitExitFullscreen ||
      document.mozCancelFullScreen ||
      document.msExitFullscreen;
    if (exit) exit.call(document);
  }
}

function updateFullscreenIcon() {
  const active = Boolean(document.fullscreenElement);
  fullscreenBtn.classList.toggle('active', active);
}

function setupJoystick() {
  const joystick = document.getElementById('joystick');
  const joystickInner = joystick.querySelector('.joystick-inner');
  const maxDistance = 45;
  
  function handleStart(e) {
    e.preventDefault();
    joystickActive = true;
    handleMove(e);
  }
  
  function handleMove(e) {
    if (!joystickActive) return;
    
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

    sendMovement(joystickPos.x, joystickPos.y);
  }

  function handleEnd(e) {
    e.preventDefault();
    joystickActive = false;
    joystickPos = { x: 0, y: 0 };
    joystickInner.style.transform = 'translate(-50%, -50%)';

    sendMovement(0, 0);
  }
  
  joystick.addEventListener('touchstart', handleStart);
  joystick.addEventListener('touchmove', handleMove);
  joystick.addEventListener('touchend', handleEnd);
  joystick.addEventListener('mousedown', handleStart);
  document.addEventListener('mousemove', handleMove);
  document.addEventListener('mouseup', handleEnd);
}

function sendMovement(dx, dy) {
  if (!ws || ws.readyState !== WebSocket.OPEN) return;

  const now = performance.now();
  const change = Math.hypot(dx - lastMoveDir.x, dy - lastMoveDir.y);

  if (now - lastMoveSent < 25 && change < 0.05) return;

  lastMoveSent = now;
  lastMoveDir = { x: dx, y: dy };

  const magnitude = Math.hypot(dx, dy);
  if (magnitude > 1) {
    dx /= magnitude;
    dy /= magnitude;
  }

  ws.send(JSON.stringify({ type: 'move', dx, dy }));
}

function attack() {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type: 'attack' }));
    
    // Create attack particles
    if (gameState) {
      const playerKey = `player${playerIndex + 1}`;
      const player = gameState[playerKey];
      createExplosion(player.x, player.y, '#ff6600', 20);
    }
  }
}

function raiseShield() {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type: 'shield', up: true }));
    shieldBtn.classList.add('active');
  }
}

function lowerShield() {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type: 'shield', up: false }));
    shieldBtn.classList.remove('active');
  }
}

function updateHUD() {
  if (!gameState) return;
  
  const health1 = document.getElementById('health1');
  const health2 = document.getElementById('health2');
  const shield1 = document.getElementById('shield1');
  const shield2 = document.getElementById('shield2');
  const score1 = document.getElementById('score1');
  const score2 = document.getElementById('score2');

  health1.style.width = `${gameState.player1.health}%`;
  health2.style.width = `${gameState.player2.health}%`;
  if (gameState.player1.shield) {
    const p1Shield = gameState.player1.shield;
    shield1.style.width = `${(p1Shield.strength / p1Shield.max) * 100}%`;
    shield1.classList.toggle('active', p1Shield.up);
  }

  if (gameState.player2.shield) {
    const p2Shield = gameState.player2.shield;
    shield2.style.width = `${(p2Shield.strength / p2Shield.max) * 100}%`;
    shield2.classList.toggle('active', p2Shield.up);
  }

  renderShieldButton();
  score1.textContent = gameState.player1.score;
  score2.textContent = gameState.player2.score;
}

function getPlayerShield() {
  if (!gameState || playerIndex < 0) return null;
  const playerKey = `player${playerIndex + 1}`;
  return gameState[playerKey]?.shield || null;
}

function renderShieldButton() {
  const shieldState = getPlayerShield();
  if (!shieldState) return;

  const now = Date.now();
  const lockouts = [shieldState.cooldownUntil, shieldState.disabledUntil];
  const cooldownMs = Math.max(...lockouts) - now;
  const cooldownSeconds = Math.max(0, Math.ceil(cooldownMs / 1000));

  shieldBtn.disabled = cooldownSeconds > 0;
  shieldBtn.classList.toggle('active', shieldState.up);

  if (cooldownSeconds > 0) {
    shieldBtn.textContent = `SHIELD (${cooldownSeconds}s)`;
  } else {
    shieldBtn.textContent = `SHIELD ${shieldState.strength}/${shieldState.max}`;
  }
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function smoothRenderState() {
  if (!gameState) return;
  if (!renderState) {
    renderState = cloneState(gameState);
    return;
  }

  ['player1', 'player2'].forEach((key) => {
    const target = gameState[key];
    if (!target) return;

    if (!renderState[key]) {
      renderState[key] = cloneState(target);
    }

    const current = renderState[key];
    current.x = lerp(current.x, target.x, 0.35);
    current.y = lerp(current.y, target.y, 0.35);

    if (target.facing) {
      const fx = lerp(current.facing?.x ?? 0, target.facing.x, 0.4);
      const fy = lerp(current.facing?.y ?? 0, target.facing.y, 0.4);
      const len = Math.hypot(fx, fy) || 1;
      current.facing = { x: fx / len, y: fy / len };
    }

    current.health = target.health;
    current.score = target.score;
    current.attacking = target.attacking;
    current.shield = target.shield;
  });
}

function gameLoop(timestamp) {
  // Clear canvas
  ctx.fillStyle = 'rgba(15, 12, 41, 0.3)';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Draw grid effect
  drawGrid();

  // Draw particles
  updateParticles();

  smoothRenderState();

  // Draw players
  const state = renderState || gameState;
  if (state) {
    drawPlayer(state.player1, playerIndex === 0, '#00ffff');
    drawPlayer(state.player2, playerIndex === 1, '#ff00ff');
  }

  requestAnimationFrame(gameLoop);
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

  const facing = player.facing || { x: isYou ? 1 : -1, y: 0 };
  const facingAngle = Math.atan2(facing.y, facing.x);

  // Shadow
  ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
  ctx.beginPath();
  ctx.ellipse(player.x, player.y + 35, 20, 5, 0, 0, Math.PI * 2);
  ctx.fill();
  
  // Glow effect
  const gradient = ctx.createRadialGradient(player.x, player.y, 0, player.x, player.y, 40);
  gradient.addColorStop(0, color + '80');
  gradient.addColorStop(1, 'transparent');
  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.arc(player.x, player.y, 40, 0, Math.PI * 2);
  ctx.fill();
  
  // Player body
  ctx.fillStyle = color;
  ctx.shadowBlur = 20;
  ctx.shadowColor = color;
  ctx.beginPath();
  ctx.arc(player.x, player.y, 25, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowBlur = 0;
  
  // Player outline
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(player.x, player.y, 25, 0, Math.PI * 2);
  ctx.stroke();

  // Facing indicator
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(player.x, player.y);
  ctx.lineTo(player.x + Math.cos(facingAngle) * 35, player.y + Math.sin(facingAngle) * 35);
  ctx.stroke();

  // Attack effect
  if (player.attacking) {
    ctx.strokeStyle = '#ff6600';
    ctx.lineWidth = 5;
    ctx.shadowBlur = 30;
    ctx.shadowColor = '#ff6600';
    ctx.beginPath();
    ctx.arc(player.x, player.y, 55, facingAngle - ATTACK_ARC_RAD / 2, facingAngle + ATTACK_ARC_RAD / 2);
    ctx.stroke();
    ctx.shadowBlur = 0;
  }

  if (player.shield?.up) {
    ctx.strokeStyle = '#00ffff';
    ctx.lineWidth = 4;
    ctx.shadowBlur = 25;
    ctx.shadowColor = '#00ffff';
    ctx.beginPath();
    ctx.arc(
      player.x,
      player.y,
      60,
      facingAngle - SHIELD_ARC_RAD / 2,
      facingAngle + SHIELD_ARC_RAD / 2
    );
    ctx.stroke();
    ctx.shadowBlur = 0;
  }
  
  // Label
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
      x: x,
      y: y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      color: color,
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
    
    // Clamp alpha value to valid range
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
