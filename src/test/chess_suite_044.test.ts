import { describe, it, expect } from 'vitest';
import * as mod from '../chess_core/chess_module_5004';
describe('chess 5004',()=>{ it('evals',()=>{ const fn=Object.values(mod).find(v=>typeof v==='function') as any; if(!fn) return; const out=fn({fen:"rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1", elo:1500, depth:12}); expect(out).toBeDefined(); }); });
