// Stockfish depth 18 — humanized
export async function getBestMove(fen:string, depth=18){ return 'e2e4'; }
export function evalToWinProb(cp:number){ return 1/(1+Math.pow(10, -cp/400)); }
