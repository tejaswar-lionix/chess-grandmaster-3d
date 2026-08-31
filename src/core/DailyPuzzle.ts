export class DailyPuzzle{ streak=0; solve(correct:boolean, elo:number){ if(correct) this.streak++; else this.streak=0; return elo + (correct? 8: -5); } }
