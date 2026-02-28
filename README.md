# ⚔️ 1v1 PVP Arena - Mobile Combat Game

A fast-paced, real-time 1v1 PVP game with stunning visual effects, optimized for mobile devices (both horizontal and vertical orientations).

## 🎮 Features

- **Real-time Multiplayer**: WebSocket-based instant PVP matchmaking
- **Mobile-Optimized**: Touch controls with virtual joystick and paired attack/shield buttons
- **Solo Practice**: Instant bot match for warmups without matchmaking
- **Cool Visual Effects**: Neon glow effects, particle systems, and smooth animations
- **Responsive Design**: Works on both portrait and landscape orientations
- **Cloudflared Tunnel**: Easy public access via cloudflared tunnel

## 🚀 Quick Start

### Prerequisites

1. **Node.js** (v14 or higher) - [Download here](https://nodejs.org/)
2. **Cloudflared** (optional, for public access) - [Download here](https://github.com/cloudflare/cloudflared/releases)

### Running the Server

#### Windows

Simply double-click `start-server.bat` or run from command prompt:

```bat
start-server.bat
```

This will:
- Install dependencies if needed
- Start the game server on http://localhost:3000
- Start the cloudflared tunnel (if installed)

#### Linux/Mac

Simply run the startup script:

```bash
chmod +x start-server.sh
./start-server.sh
```

Or manually:

```bash
# Install dependencies
npm install

# Start the server
npm start
```

### Accessing the Game

- **Locally**: Open http://localhost:3000 in your browser
- **Publicly** (with cloudflared): Access via https://irgri.uk or https://www.irgri.uk
- **Static hosting**: The client will connect to the WebSocket server defined in `public/config.js` (defaults to `irgri.uk` when not on localhost). Update `window.SERVER_HOST` there or pass `?server=host:port` in the URL to point the UI at your running server.

## 🎯 How to Play

1. Pick **PLAY ONLINE** to queue or **SOLO PRACTICE** for a bot fight
2. Tap the **fullscreen** orb to hide browser chrome on phones
3. Use the **joystick** (bottom-left) to move and face your katana
4. Hit **ATTACK** (bottom-right) to strike in your facing direction
5. Hold **SHIELD** to block; parry inside 0.4s to stagger foes
6. Reduce opponent's health to zero to win the round
7. First to score wins!

## 🛠️ Configuration

### Cloudflared Tunnel

The tunnel configuration is in `cloudflared-config.yml`. Update the following:

- `tunnel`: Your tunnel name
- `credentials-file`: Path to your cloudflared credentials
- `hostname`: Your custom domain(s)

```yaml
tunnel: irgri-tunnel
credentials-file: C:\Users\SadSock\.cloudflared\dc4ed8c1-690f-449a-b5a9-085c1476fb57.json

ingress:
  - hostname: irgri.uk
    service: http://localhost:3000
  - hostname: www.irgri.uk
    service: http://localhost:3000
  - service: http_status:404
```

### Server Port

To change the server port, edit `server.js`:

```javascript
const PORT = 3000; // Change this value
```

## 📱 Mobile Support

The game is fully optimized for mobile devices:

- **Touch Controls**: Virtual joystick plus large attack/shield buttons
- **Responsive Layout**: Adapts to portrait and landscape modes
- **Optimized Performance**: Smooth 60 FPS gameplay
- **No Zoom**: Prevents accidental zooming on touch devices

## 🎨 Technology Stack

- **Frontend**: HTML5 Canvas, CSS3, Vanilla JavaScript
- **Backend**: Node.js, Express, WebSocket (ws)
- **Tunnel**: Cloudflared
- **Design**: Neon-themed UI with particle effects

## 📄 Project Structure

```
1v1-pvp/
├── public/
│   ├── index.html      # Main game HTML
│   ├── style.css       # Neon-themed styles
│   ├── config.js       # Client connection config (SERVER_HOST)
│   └── game.js         # Game client logic
├── server.js           # WebSocket game server
├── package.json        # Node.js dependencies
├── start-server.bat    # Windows startup script
└── cloudflared-config.yml  # Cloudflared configuration
```

## 🔧 Development

To modify the game:

1. Edit files in the `public/` folder for client-side changes
2. Edit `server.js` for server-side game logic
3. Refresh your browser to see changes (client-side)
4. Restart the server for server-side changes

## 📝 License

MIT License - Feel free to use and modify!

## 🔒 Security Notes

This is a demonstration game server intended for local development and small-scale deployments via cloudflared tunnel. For production use, consider:

- Adding rate-limiting middleware (e.g., `express-rate-limit`)
- Implementing proper authentication for multiplayer sessions
- Adding input validation and sanitization
- Using HTTPS for all connections

## 🎮 Enjoy the Game!

Have fun battling in the arena! ⚔️✨