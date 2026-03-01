// Game client
let ws;
let canvas, ctx;
let playerIndex = -1;
let gameState = null;
let joystickActive = false;
let joystickPos = { x: 0, y: 0 };
let particles = [];
const desktopMode = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
const pressedKeys = new Set();
let shieldActive = false;

// UI elements
const menuScreen = document.getElementById('menu');
const gameScreen = document.getElementById('game');
const roundEndScreen = document.getElementById('roundEnd');
const playBtn = document.getElementById('playBtn');
const attackBtn = document.getElementById('attackBtn');
const statusDiv = document.getElementById('status');
const continueBtn = document.getElementById('continueBtn');
const controlsDiv = document.querySelector('.controls');
const desktopHint = document.getElementById('desktopHint');

// Initialize
window.addEventListener('load', () => {
  canvas = document.getElementById('gameCanvas');
  ctx = canvas.getContext('2d');
  
  resizeCanvas();
  window.addEventListener('resize', resizeCanvas);
  
  playBtn.addEventListener('click', joinGame);
  attackBtn.addEventListener('touchstart', (e) => {
    e.preventDefault();
    attack();
  });
  attackBtn.addEventListener('click', attack);
  
  continueBtn.addEventListener('click', () => {
    roundEndScreen.classList.add('hidden');
  });
  
  setupJoystick();
  setupDesktopControls();
  
  // Start animation loop
  requestAnimationFrame(gameLoop);
});

function resizeCanvas() {
  canvas.width = window.innerWidth;
  canvas.height = desktopMode ? window.innerHeight - 60 : window.innerHeight - 150 - 60; // HUD + controls
}

function connectWebSocket() {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const host = window.location.host;
  ws = new WebSocket(`${protocol}//${host}`);
  
  ws.onopen = () => {
    console.log('Connected to server');
    ws.send(JSON.stringify({ type: 'joinQueue' }));
    statusDiv.textContent = 'Searching for opponent...';
  };
  
  ws.onmessage = (event) => {
    const data = JSON.parse(event.data);
    handleServerMessage(data);
  };
  
  ws.onerror = (error) => {
    console.error('WebSocket error:', error);
    statusDiv.textContent = 'Connection error. Please refresh.';
  };
  
  ws.onclose = () => {
    console.log('Disconnected from server');
    if (gameScreen.classList.contains('hidden')) {
      statusDiv.textContent = 'Disconnected. Please try again.';
    } else {
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

function joinGame() {
  playBtn.disabled = true;
  connectWebSocket();
}

function setupJoystick() {
  if (desktopMode) {
    const joystickContainer = document.querySelector('.joystick-container');
    joystickContainer.classList.add('hidden');
    controlsDiv.classList.add('desktop-controls');
    desktopHint.classList.remove('hidden');
    attackBtn.classList.add('hidden');
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
    
    // Send movement to server
    if (ws && ws.readyState === WebSocket.OPEN && gameState) {
      const speed = 5;
      const playerKey = `player${playerIndex + 1}`;
      const player = gameState[playerKey];
      
      ws.send(JSON.stringify({
        type: 'move',
        x: Math.max(20, Math.min(canvas.width - 20, player.x + joystickPos.x * speed)),
        y: Math.max(20, Math.min(canvas.height - 20, player.y + joystickPos.y * speed))
      }));
    }
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

function setupDesktopControls() {
  if (!desktopMode) return;

  window.addEventListener('keydown', (event) => {
    const key = event.key.toLowerCase();
    if (['w', 'a', 's', 'd'].includes(key)) {
      event.preventDefault();
      pressedKeys.add(key);
      sendDesktopMovement();
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

function sendDesktopMovement() {
  if (!desktopMode || !gameState || !pressedKeys.size) return;
  if (!ws || ws.readyState !== WebSocket.OPEN) return;

  const playerKey = `player${playerIndex + 1}`;
  const player = gameState[playerKey];
  if (!player) return;

  let deltaX = 0;
  let deltaY = 0;

  if (pressedKeys.has('w')) deltaY -= 1;
  if (pressedKeys.has('s')) deltaY += 1;
  if (pressedKeys.has('a')) deltaX -= 1;
  if (pressedKeys.has('d')) deltaX += 1;

  if (deltaX === 0 && deltaY === 0) return;

  const length = Math.hypot(deltaX, deltaY) || 1;
  const speed = 5;

  ws.send(JSON.stringify({
    type: 'move',
    x: Math.max(20, Math.min(canvas.width - 20, player.x + (deltaX / length) * speed)),
    y: Math.max(20, Math.min(canvas.height - 20, player.y + (deltaY / length) * speed))
  }));
}

function setShield(active) {
  if (!desktopMode || shieldActive === active) return;
  shieldActive = active;

  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type: 'shield', active }));
  }
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
  // Clear canvas
  ctx.fillStyle = 'rgba(15, 12, 41, 0.3)';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  
  // Draw grid effect
  drawGrid();
  
  // Draw particles
  updateParticles();
  
  // Draw players
  if (gameState) {
    if (desktopMode) {
      sendDesktopMovement();
    }

    drawPlayer(gameState.player1, playerIndex === 0, '#00ffff');
    drawPlayer(gameState.player2, playerIndex === 1, '#ff00ff');
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
  
  // Attack effect
  if (player.attacking) {
    ctx.strokeStyle = '#ff6600';
    ctx.lineWidth = 5;
    ctx.shadowBlur = 30;
    ctx.shadowColor = '#ff6600';
    ctx.beginPath();
    ctx.arc(player.x, player.y, 45, 0, Math.PI * 2);
    ctx.stroke();
    ctx.shadowBlur = 0;
  }

  if (player.shielding) {
    ctx.strokeStyle = '#4ecbff';
    ctx.lineWidth = 6;
    ctx.shadowBlur = 25;
    ctx.shadowColor = '#4ecbff';
    ctx.beginPath();
    ctx.arc(player.x, player.y, 36, 0, Math.PI * 2);
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
