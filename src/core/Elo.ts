// Humanized ELO
export function eloChange(rating:number, opp:number, score:number, k=20){ const expected=1/(1+Math.pow(10,(opp-rating)/400)); return Math.round(rating + k*(score - expected)); }
export function puzzleRating(puzzleElo:number, userElo:number, solved:boolean){ return eloChange(puzzleElo, userElo, solved?0:1, 10); }
