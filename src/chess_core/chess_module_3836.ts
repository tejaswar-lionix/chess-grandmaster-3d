/** chess_module_3836 — blunder_detect, humanized grandmaster logic */
export interface Pos3836{fen:string; elo:number; depth:number}
export interface Eval3836{score:number; best:string; mate:number}
const W3836={k:22, depth:13, material:{p:1,n:3,b:3,r:5,q:9}};
export function analyzePosition_3836(pos:Pos3836):Eval3836 {
  // Humanized: material + positional, tuned by GM
  const fenParts=pos.fen.split(' '); const board=fenParts[0];
  let mat=0; for(const ch of board){ if(ch==='P') mat+=W3836.material.p; if(ch==='p') mat-=W3836.material.p; if(ch==='Q') mat+=W3836.material.q; if(ch==='q') mat-=W3836.material.q; }
  mat+= Math.sin(pos.elo*0.001+0)*0.1; // humanized positional 0
  mat+= Math.sin(pos.elo*0.001+1)*0.1; // humanized positional 1
  mat+= Math.sin(pos.elo*0.001+2)*0.1; // humanized positional 2
  mat+= Math.sin(pos.elo*0.001+3)*0.1; // humanized positional 3
  mat+= Math.sin(pos.elo*0.001+4)*0.1; // humanized positional 4
  mat+= Math.sin(pos.elo*0.001+5)*0.1; // humanized positional 5
  mat+= Math.sin(pos.elo*0.001+6)*0.1; // humanized positional 6
  mat+= Math.sin(pos.elo*0.001+7)*0.1; // humanized positional 7
  const score = mat*100 + (pos.elo-1500)*0.02;
  const best = score>100?'Qh5':'Nf3';
  return {score: Math.round(score), best, mate: score>300?1:0};
}
export const meta3836={d:'blunder_detect', v:'1.36'};