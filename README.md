# CODE RACE — The Programmers' Challenge

**CODE RACE** is an educational digital board game set in **NEON CITY**, a cyberpunk-inspired 3D environment. Developed to teach and reinforce fundamental Python programming concepts through challenges, strategy, and team interaction.

The project combines an immersive visual experience with game mechanics, turning programming education into a collaborative competition.

## About the Game

In NEON CITY, teams travel through different districts, facing programming challenges along the way. The objective is to advance across the board, overcome obstacles, and reach the **Central Nexus**, where the final challenge awaits.

Throughout the match, players must correctly answer Python questions, use strategic abilities, and adapt to events that can change the course of the game.

### Key Features

- 3D digital board game environment.
- Cyberpunk-inspired city and visual design.
- Python programming questions organized by difficulty.
- Multiplayer matches with multiple teams.
- Turn-based gameplay, dice rolls, and board progression.
- Special abilities and dynamic in-game events.
- Dedicated teacher control interface.
- Local game progress saving.

## Technologies

| Technology | Purpose |
|---|---|
| HTML5 | Interface structure |
| CSS3 | Styling and animations |
| JavaScript | Game logic and mechanics |
| Three.js | 3D environment rendering |
| Electron | Desktop application |
| Node.js / npm | Runtime environment and dependency management |

## Getting Started

### Prerequisites

- Node.js
- npm

### 1. Clone the repository

```bash
git clone <REPOSITORY_URL>
```

### 2. Navigate to the project directory

```bash
cd CODE-RACE
```

### 3. Install dependencies

```bash
npm ci
```

### 4. Run the game

```bash
npm run dev
```

## Testing

The project includes an automated desktop smoke test to verify application loading and key gameplay flows.

Run it with:

```bash
npm run test:desktop
```

## Building

The project uses Electron Builder to generate desktop distributions.

**macOS (Apple Silicon):**

```bash
npm run build:mac
```

**Windows (installer):**

```bash
npm run build:win:installer
```

**Windows (portable version):**

```bash
npm run build:win:portable
```

Build artifacts are generated in the `dist/` directory.

> Note: Windows builds should be generated in a Windows environment. The macOS build is configured for ARM64 architecture.

## Project Structure

```text
CODE-RACE/
│
├── prototype/
│   └── neon-city/
│       ├── assets/
│       ├── src/
│       ├── index.html
│       ├── neon-city.css
│       ├── neon-city.js
│       └── BUILD-WINDOWS.md
│
├── electron-main.cjs
├── package.json
├── package-lock.json
├── GAME_SPEC.md
└── .gitignore
```

### Main Directories and Files

- `prototype/neon-city/`: Main game implementation.
- `assets/`: 3D models, images, videos, and other visual resources.
- `src/`: Application modules and components.
- `electron-main.cjs`: Electron application entry point and configuration.
- `GAME_SPEC.md`: Game design and functionality specification.
- `package.json`: Project dependencies and execution/build scripts.

## Architecture

CODE RACE runs locally, without requiring a remote backend or database. Game resources are loaded locally, and match progress is stored on the user's device.

## Educational Purpose

The project aims to make programming education more engaging and accessible by encouraging logical thinking, problem-solving, collaboration, and the practical application of Python fundamentals.

---
