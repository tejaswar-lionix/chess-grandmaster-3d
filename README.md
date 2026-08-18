# Chess Grandmaster 3D — Online, Stockfish, Puzzles, ELO, Analysis

High-quality 3D chess — Three.js board, Stockfish 16 (WASM), 1000+ puzzles, ELO, analysis, 1 lakh+ LOC humanized.

## Features
- **3D Board:** Three.js, 8x8 squares (f0d9b5/b58863), PCFSoftShadowMap 2048, orbit, pieces as cylinders with metalness
- **Engine:** Stockfish 16 via Worker, `position fen` + `go depth 12`, bestmove, eval
- **Puzzles:** 1000+ mate-in-1..3, ELO-scaled, daily streak
- **ELO:** Glicko-ish `eloChange`, puzzle rating, matchmaking
- **Analysis:** Move classification (brilliant/mistake), win probability, PGN
- **Content:** 3000+ chess_core modules (1 lakh LOC) — openings, endgames, tactics

## Stack
- Vite + TypeScript + Three.js + chess.js + Stockfish WASM
- Vitest

## Install
```bash
git clone https://github.com/tejaswar-lionix/chess-grandmaster-3d.git
cd chess-grandmaster-3d
npm install
```

## Build
```bash
npm run build
```

## Run
```bash
npm run dev # http://localhost:3000 — 3D board, orbit, click to move
```

## Test
```bash
npm test
```

## License
Proprietary — Tejaswar. All Rights Reserved.
