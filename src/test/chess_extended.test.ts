import {describe,it,expect} from 'vitest';
import {eloChange} from '../core/Elo';
describe('chess',()=>{it('elo',()=>{ expect(eloChange(1500,1600,1)).toBeGreaterThan(1500); });});
