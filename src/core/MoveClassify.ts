export type Cls='brilliant'|'great'|'mistake'|'blunder';
export function classify(prevEval:number, newEval:number, isSac:boolean):Cls{ const d=newEval-prevEval; if(isSac&&d>100) return 'brilliant'; if(d<-200) return 'blunder'; if(d<-100) return 'mistake'; return 'great'; }
