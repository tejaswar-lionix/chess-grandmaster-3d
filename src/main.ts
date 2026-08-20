import { ChessBoard3D } from './core/ChessBoard3D';
console.log('Chess Grandmaster 3D — Stockfish + Puzzles + ELO, 1 lakh LOC');
const board = new ChessBoard3D('app');
board.start();
(window as any).board = board;
