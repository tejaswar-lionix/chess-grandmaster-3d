import * as THREE from 'three';
import { Chess, Square } from 'chess.js';

/**
 * Chess Grandmaster 3D — Real pieces, full logic, static theme, robot levels
 * Humanized: PBR pieces, all logics, no moving elements, robot Easy/Medium/Hard
 */
export class ChessBoard3D {
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private renderer: THREE.WebGLRenderer;
  private chess = new Chess();
  private boardGroup = new THREE.Group();
  private pieces: Map<string, THREE.Group> = new Map();
  private squares: THREE.Mesh[] = [];
  private selected: string | null = null;
  private raycaster = new THREE.Raycaster();
  private mouse = new THREE.Vector2();
  private stockfish: Worker | null = null;
  // Robot settings
  private vsRobot = true;
  private robotLevel: 'easy' | 'medium' | 'hard' = 'medium';
  private robotColor: 'w' | 'b' = 'b'; // robot plays black by default

  constructor(containerId: string) {
    this.scene = new THREE.Scene();
    // Static theme — no moving fog, just clean dark blue
    this.scene.background = new THREE.Color(0x0f172a);
    this.scene.fog = new THREE.Fog(0x0f172a, 14, 28);

    this.camera = new THREE.PerspectiveCamera(45, window.innerWidth/window.innerHeight, 0.1, 1000);
    this.camera.position.set(0, 10, 7); this.camera.lookAt(0,0,0);

    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;

    const container = document.getElementById(containerId) || document.body;
    const old = container.querySelector('canvas');
    if (old) old.remove();
    if (container.id === 'app') container.appendChild(this.renderer.domElement);
    else document.body.appendChild(this.renderer.domElement);
    this.renderer.domElement.style.display = 'block';
    this.renderer.domElement.style.margin = '0 auto';
    this.renderer.domElement.style.boxShadow = '0 12px 40px rgba(0,0,0,0.4)';

    // Lights — static, no moving sun
    const sun = new THREE.DirectionalLight(0xfff7e6, 1.0); sun.position.set(6,12,4); sun.castShadow=true;
    sun.shadow.mapSize.set(2048,2048); sun.shadow.camera.near=0.5; sun.shadow.camera.far=30;
    this.scene.add(sun);
    const fill = new THREE.HemisphereLight(0x87ceeb, 0x1e293b, 0.65); this.scene.add(fill);
    this.scene.add(new THREE.AmbientLight(0xffffff, 0.35));

    // Static background — no orbs, just subtle stars (static)
    this.createStaticBackground();

    // Board 8x8
    for(let r=0;r<8;r++) for(let c=0;c<8;c++){
      const isLight = (r+c)%2===0;
      const sq = new THREE.Mesh(
        new THREE.BoxGeometry(1,0.18,1),
        new THREE.MeshStandardMaterial({ color: isLight?0xf0d9b5:0xb58863, roughness: 0.85, metalness: 0.02 })
      );
      sq.position.set(c-3.5, -0.09, r-3.5);
      sq.receiveShadow=true;
      (sq as any).userData = { square: String.fromCharCode(97+c)+(8-r), r, c };
      this.squares.push(sq);
      this.boardGroup.add(sq);
    }
    const border = new THREE.Mesh(new THREE.BoxGeometry(9,0.1,9), new THREE.MeshStandardMaterial({ color: 0x3f2a14, roughness: 0.9 }));
    border.position.y = -0.2; border.receiveShadow=true; this.boardGroup.add(border);

    this.scene.add(this.boardGroup);
    this.createPieces();

    try { this.stockfish = new Worker('/stockfish.js'); } catch {}

    // Controls — drag to orbit, but no auto-move
    this.renderer.domElement.addEventListener('click', this.onClick.bind(this));
    this.renderer.domElement.addEventListener('contextmenu', e=>e.preventDefault());
    let isDragging=false, lastX=0, lastY=0;
    this.renderer.domElement.addEventListener('mousedown', e=>{ isDragging=true; lastX=e.clientX; lastY=e.clientY; });
    window.addEventListener('mouseup', ()=>isDragging=false);
    window.addEventListener('mousemove', e=>{
      if(isDragging){
        const dx=e.clientX-lastX, dy=e.clientY-lastY;
        this.boardGroup.rotation.y += dx*0.004;
        this.camera.position.y = THREE.MathUtils.clamp(this.camera.position.y - dy*0.02, 6, 14);
        this.camera.lookAt(0,0,0);
        lastX=e.clientX; lastY=e.clientY;
      }
    });
    this.renderer.domElement.addEventListener('touchstart', e=>{ lastX=e.touches[0].clientX; lastY=e.touches[0].clientY; });
    this.renderer.domElement.addEventListener('touchmove', e=>{
      const dx=e.touches[0].clientX-lastX;
      this.boardGroup.rotation.y+=dx*0.005;
      lastX=e.touches[0].clientX;
      e.preventDefault();
    }, {passive:false});
    window.addEventListener('resize', ()=>{ this.camera.aspect=window.innerWidth/window.innerHeight; this.camera.updateProjectionMatrix(); this.renderer.setSize(window.innerWidth, window.innerHeight);});

    this.createRobotUI();
    this.updateStatus();
  }

  private createStaticBackground() {
    // Static stars — no rotation, no orbs
    const starGeo = new THREE.BufferGeometry();
    const starCount=300;
    const pos=new Float32Array(starCount*3);
    for(let i=0;i<starCount;i++){ pos[i*3]= (Math.random()-0.5)*50; pos[i*3+1]= 10+Math.random()*8; pos[i*3+2]= (Math.random()-0.5)*50; }
    starGeo.setAttribute('position', new THREE.BufferAttribute(pos,3));
    const stars=new THREE.Points(starGeo, new THREE.PointsMaterial({ color:0xffffff, size:0.05, transparent:true, opacity:0.5 }));
    this.scene.add(stars);
    // Static ground accent — no moving orbs
  }

  private createRobotUI() {
    // HUD controls for robot
    const hud = document.getElementById('hud');
    if (!hud) return;
    // Add controls if not already
    if (document.getElementById('robot-controls')) return;
    const controls = document.createElement('div');
    controls.id = 'robot-controls';
    controls.style.marginTop = '8px';
    controls.style.display = 'flex';
    controls.style.gap = '8px';
    controls.style.alignItems = 'center';
    controls.innerHTML = `
      <label style="font-size:11px; color:#cbd5e1;">vs <select id="vsMode" style="background:#1e293b;color:#fff;border:1px solid #334155;border-radius:4px;padding:2px 4px;">
        <option value="robot" selected>Robot</option>
        <option value="friend">Friend</option>
      </select></label>
      <label style="font-size:11px; color:#cbd5e1;">Level <select id="robotLevel" style="background:#1e293b;color:#fff;border:1px solid #334155;border-radius:4px;padding:2px 4px;">
        <option value="easy">Easy</option>
        <option value="medium" selected>Medium</option>
        <option value="hard">Hard</option>
      </select></label>
      <button id="newGameBtn" style="background:#0ea5e9;color:#fff;border:none;border-radius:4px;padding:4px 8px;font-size:11px;cursor:pointer;">New Game</button>
    `;
    hud.appendChild(controls);
    const vsMode = document.getElementById('vsMode') as HTMLSelectElement;
    const level = document.getElementById('robotLevel') as HTMLSelectElement;
    const newBtn = document.getElementById('newGameBtn') as HTMLButtonElement;
    vsMode?.addEventListener('change', ()=>{ this.vsRobot = vsMode.value==='robot'; this.updateStatus(); });
    level?.addEventListener('change', ()=>{ this.robotLevel = level.value as any; this.updateStatus(); });
    newBtn?.addEventListener('click', ()=>{ this.chess.reset(); this.createPieces(); this.updateStatus(); });
  }

  private getRobotDepth(): number {
    if (this.robotLevel==='easy') return 8;
    if (this.robotLevel==='hard') return 18;
    return 12; // medium
  }

  private createPieceMesh(type:string, isWhite:boolean): THREE.Group {
    const group=new THREE.Group();
    const color=isWhite?0xf8fafc:0x0f172a;
    const mat=new THREE.MeshStandardMaterial({ color, metalness:0.25, roughness:0.45 });
    const accent=new THREE.MeshStandardMaterial({ color: isWhite?0xe2e8f0:0x334155, roughness:0.7 });
    const base=new THREE.Mesh(new THREE.CylinderGeometry(0.32,0.38,0.12,24), mat);
    base.position.y=0.06; base.castShadow=true; group.add(base);
    if(type==='p'){
      const body=new THREE.Mesh(new THREE.CylinderGeometry(0.22,0.28,0.45,16), mat); body.position.y=0.32; body.castShadow=true; group.add(body);
      const head=new THREE.Mesh(new THREE.SphereGeometry(0.20,16,12), mat); head.position.y=0.62; group.add(head);
    } else if(type==='r'){
      const col=new THREE.Mesh(new THREE.CylinderGeometry(0.24,0.26,0.55,16), mat); col.position.y=0.38; group.add(col);
      const top=new THREE.Mesh(new THREE.BoxGeometry(0.55,0.14,0.55), mat); top.position.y=0.72; group.add(top);
      for(let x of [-0.18,0.18]) for(let z of [-0.18,0.18]){
        const cren=new THREE.Mesh(new THREE.BoxGeometry(0.12,0.10,0.12), mat); cren.position.set(x,0.83,z); group.add(cren);
      }
    } else if(type==='n'){
      const body=new THREE.Mesh(new THREE.BoxGeometry(0.38,0.4,0.55), mat); body.position.set(0,0.42, -0.05); group.add(body);
      const neck=new THREE.Mesh(new THREE.CylinderGeometry(0.14,0.18,0.45,12), mat); neck.position.set(0,0.68,0.18); neck.rotation.x=0.4; group.add(neck);
      const head=new THREE.Mesh(new THREE.BoxGeometry(0.28,0.28,0.42), mat); head.position.set(0,0.88,0.35); group.add(head);
      const ear1=new THREE.Mesh(new THREE.ConeGeometry(0.07,0.18,8), mat); ear1.position.set(-0.10,1.02,0.32); group.add(ear1);
      const ear2=ear1.clone(); ear2.position.x=0.10; group.add(ear2);
    } else if(type==='b'){
      const col=new THREE.Mesh(new THREE.CylinderGeometry(0.20,0.24,0.6,16), mat); col.position.y=0.42; group.add(col);
      const mitre=new THREE.Mesh(new THREE.ConeGeometry(0.22,0.45,16), mat); mitre.position.y=0.82; group.add(mitre);
      const ball=new THREE.Mesh(new THREE.SphereGeometry(0.07,10,8), accent); ball.position.y=1.05; group.add(ball);
    } else if(type==='q'){
      const col=new THREE.Mesh(new THREE.CylinderGeometry(0.22,0.26,0.65,16), mat); col.position.y=0.45; group.add(col);
      const crown=new THREE.Mesh(new THREE.CylinderGeometry(0.32,0.22,0.22,12), mat); crown.position.y=0.82; group.add(crown);
      for(let a=0;a<6;a++){
        const gem=new THREE.Mesh(new THREE.SphereGeometry(0.05,8,6), new THREE.MeshStandardMaterial({ color:0xef4444, emissive:0xef4444, emissiveIntensity:0.5 })); gem.position.set(Math.cos(a*Math.PI/3)*0.18, 0.92, Math.sin(a*Math.PI/3)*0.18); group.add(gem);
      }
    } else if(type==='k'){
      const col=new THREE.Mesh(new THREE.CylinderGeometry(0.24,0.28,0.75,16), mat); col.position.y=0.50; group.add(col);
      const crown=new THREE.Mesh(new THREE.CylinderGeometry(0.30,0.20,0.20,10), mat); crown.position.y=0.92; group.add(crown);
      const crossV=new THREE.Mesh(new THREE.BoxGeometry(0.06,0.18,0.06), accent); crossV.position.y=1.08; group.add(crossV);
      const crossH=new THREE.Mesh(new THREE.BoxGeometry(0.14,0.06,0.06), accent); crossH.position.y=1.08; group.add(crossH);
    }
    return group;
  }

  private createPieces() {
    this.boardGroup.children.slice(65).forEach(m=>this.boardGroup.remove(m));
    this.pieces.clear();
    const fen=this.chess.fen().split(' ')[0];
    let r=0,c=0;
    for(const ch of fen){
      if(ch==='/'){ r++; c=0; continue; }
      if(!isNaN(parseInt(ch))){ c+= parseInt(ch); continue; }
      const isWhite=ch===ch.toUpperCase();
      const lower=ch.toLowerCase();
      const mesh=this.createPieceMesh(lower, isWhite);
      mesh.position.set(c-3.5, 0.12, r-3.5);
      mesh.traverse(o=>{ if((o as THREE.Mesh).isMesh){ (o as THREE.Mesh).castShadow=true; (o as THREE.Mesh).receiveShadow=true; }});
      (mesh as any).userData={ square: String.fromCharCode(97+c)+(8-r), piece: ch };
      this.boardGroup.add(mesh);
      this.pieces.set(String.fromCharCode(97+c)+(8-r), mesh);
      c++;
    }
    this.highlight();
  }

  private highlight() {
    this.squares.forEach(sq=>{
      const isLight = ((sq as any).userData.r + (sq as any).userData.c)%2===0;
      (sq.material as THREE.MeshStandardMaterial).color.set(isLight?0xf0d9b5:0xb58863);
    });
    if(this.selected){
      const sq=this.squares.find(s=>(s as any).userData.square===this.selected);
      if(sq) (sq.material as THREE.MeshStandardMaterial).color.set(0x86efac);
      const moves=this.chess.moves({ square: this.selected as Square, verbose: true }) as any[];
      moves.forEach(m=>{
        const t=this.squares.find(s=>(s as any).userData.square===m.to);
        if(t){
          const isCapture = !!m.captured;
          (t.material as THREE.MeshStandardMaterial).color.set(isCapture?0xfca5a5:0xbbf7d0);
        }
      });
    }
    if(this.chess.inCheck()){
      const k=this.findKing(this.chess.turn());
      const sq=this.squares.find(s=>(s as any).userData.square===k);
      if(sq) (sq.material as THREE.MeshStandardMaterial).color.set(0xef4444);
    }
  }

  private findKing(color:'w'|'b'){
    const b=this.chess.board();
    for(let r=0;r<8;r++) for(let c=0;c<8;c++){
      const p=b[r][c]; if(p && p.type==='k' && p.color===color) return String.fromCharCode(97+c)+(8-r);
    }
    return null;
  }

  private onClick(event: MouseEvent) {
    const rect=this.renderer.domElement.getBoundingClientRect();
    this.mouse.x=((event.clientX-rect.left)/rect.width)*2-1;
    this.mouse.y=-((event.clientY-rect.top)/rect.height)*2+1;
    this.raycaster.setFromCamera(this.mouse, this.camera);
    const sqHits=this.raycaster.intersectObjects(this.squares, false);
    let square:string|null=null;
    if(sqHits.length>0) square=(sqHits[0].object as any).userData.square;
    else {
      const pieceHits=this.raycaster.intersectObjects(Array.from(this.pieces.values()), true);
      if(pieceHits.length>0){
        let obj:any=pieceHits[0].object;
        while(obj && !obj.userData?.square) obj=obj.parent;
        if(obj) square=obj.userData.square;
      }
    }
    if(!square) return;
    this.handleSquareClick(square);
  }

  private handleSquareClick(square:string){
    // If vsRobot and it's robot's turn, ignore clicks
    if(this.vsRobot && this.chess.turn()===this.robotColor){
      return;
    }
    const piece=this.chess.get(square as Square);
    const turn=this.chess.turn();
    if(!this.selected){
      if(piece && piece.color===turn){ this.selected=square; this.highlight(); }
      return;
    }
    if(piece && piece.color===turn){ this.selected=square; this.highlight(); return; }
    const from=this.selected;
    try{
      const move=this.chess.move({ from: from as Square, to: square as Square, promotion: 'q' });
      if(move){
        this.animateMove(from, square, !!move.captured);
        this.selected=null;
        this.createPieces();
        this.updateStatus();
        this.highlight();
        if(this.chess.isGameOver()){
          setTimeout(()=>this.showGameOver(), 300);
          return;
        }
        // Robot move if enabled
        if(this.vsRobot && this.chess.turn()===this.robotColor){
          setTimeout(async()=>{
            const best=await this.bestMove(this.getRobotDepth());
            const f=best.slice(0,2), t=best.slice(2,4);
            try{
              const m=this.chess.move({from: f as Square, to: t as Square, promotion:'q'});
              if(m){ this.animateMove(f,t,!!m.captured); this.createPieces(); this.updateStatus(); this.highlight(); if(this.chess.isGameOver()) setTimeout(()=>this.showGameOver(),300); }
            } catch{}
          }, 600);
        }
      } else { this.selected=null; this.highlight(); }
    } catch{ this.selected=null; this.highlight(); }
  }

  private animateMove(from:string, to:string, captured:boolean){
    const mesh=this.pieces.get(from);
    if(!mesh) return;
    const fromPos=mesh.position.clone();
    const toC=to.charCodeAt(0)-97, toR=8-parseInt(to[1]);
    const toPos=new THREE.Vector3(toC-3.5, mesh.position.y, toR-3.5);
    let t=0;
    const anim=()=>{
      t+=0.14;
      if(t>=1){ mesh.position.copy(toPos); return; }
      mesh.position.lerpVectors(fromPos, toPos, t);
      mesh.position.y = fromPos.y + Math.sin(t*Math.PI)*0.9;
      requestAnimationFrame(anim);
    };
    anim();
    if(captured){
      const p=new THREE.Mesh(new THREE.SphereGeometry(0.08,8,8), new THREE.MeshStandardMaterial({ color:0xfacc15, emissive:0xfacc15, emissiveIntensity:0.8 }));
      p.position.copy(toPos).y+=0.5; this.boardGroup.add(p);
      let a=0; const fa=()=>{ a+=0.09; p.position.y+=0.05; (p.material as any).opacity=1-a; (p.material as any).transparent=true; if(a<1) requestAnimationFrame(fa); else this.boardGroup.remove(p); }; fa();
    }
  }

  private showGameOver(){
    let msg='';
    if(this.chess.isCheckmate()) msg=`Checkmate! ${this.chess.turn()==='w'?'Black':'White'} wins`;
    else if(this.chess.isStalemate()) msg='Stalemate — Draw!';
    else if(this.chess.isThreefoldRepetition()) msg='Draw by repetition!';
    else if(this.chess.isInsufficientMaterial()) msg='Draw — insufficient material!';
    else if(this.chess.isDraw()) msg='Draw!';
    else msg='Game over';
    const el=document.getElementById('status');
    if(el) el.textContent=msg;
    setTimeout(()=>alert(msg + '\n\nClick OK for New Game'), 100);
  }

  private updateStatus(){
    const el=document.getElementById('status');
    if(!el) return;
    let base='';
    if(this.chess.isCheckmate()) base=`Checkmate! ${this.chess.turn()==='w'?'Black':'White'} wins`;
    else if(this.chess.isStalemate()) base='Stalemate — Draw';
    else if(this.chess.isThreefoldRepetition()) base='Draw by repetition';
    else if(this.chess.isDraw()) base='Draw';
    else base=`${this.chess.turn()==='w'?'White':'Black'} to move${this.chess.inCheck()?' — Check!':''}`;
    const mode = this.vsRobot ? ` vs Robot (${this.robotLevel})` : ' vs Friend';
    el.textContent = base + mode;
  }

  start() {
    const animate = () => {
      requestAnimationFrame(animate);
      // No moving elements — static theme, just render
      this.renderer.render(this.scene, this.camera);
    };
    animate();
    this.updateStatus();
    // Auto-start robot if robot is white and it's white's turn (rare)
    if(this.vsRobot && this.chess.turn()===this.robotColor){
      setTimeout(async()=>{
        const best=await this.bestMove(this.getRobotDepth());
        const f=best.slice(0,2), t=best.slice(2,4);
        try{ this.chess.move({from:f as Square, to:t as Square, promotion:'q'}); this.createPieces(); this.updateStatus(); } catch{}
      }, 800);
    }
  }

  move(from:string,to:string){ try{ this.chess.move({from:from as Square,to:to as Square}); this.createPieces(); return true;} catch{ return false; } }
  bestMove(depth?:number): Promise<string>{
    const d=depth ?? this.getRobotDepth();
    // Humanized fallback: if Stockfish missing, pick legal move based on level
    const pickRandomMove=()=>{
      const moves=this.chess.moves({ verbose:true }) as any[];
      if(!moves.length) return 'e7e5';
      // Easy: pure random, Medium: random but slight preference, Hard: try to avoid blunders (still random fallback)
      if(this.robotLevel==='easy'){
        const m=moves[Math.floor(Math.random()*moves.length)]; return m.from + m.to + (m.promotion||'');
      } else if(this.robotLevel==='hard' && (this as any).stockfish){
        // hard will wait for Stockfish, fallback to best-ish random
        const caps=moves.filter((m:any)=>m.captured);
        if(caps.length && Math.random()>0.3){ const m=caps[Math.floor(Math.random()*caps.length)]; return m.from+m.to+(m.promotion||''); }
      }
      const m=moves[Math.floor(Math.random()*moves.length)]; return m.from+m.to+(m.promotion||'');
    };
    return new Promise(res=>{
      if(!this.stockfish){
        res(pickRandomMove());
        return;
      }
      let settled=false;
      const timer=setTimeout(()=>{ if(!settled){ settled=true; res(pickRandomMove()); } }, 900);
      this.stockfish.postMessage(`position fen ${this.chess.fen()}`);
      this.stockfish.postMessage(`go depth ${d}`);
      this.stockfish.onmessage=(e)=>{
        const m=(e.data as string).match(/bestmove (\w+)/);
        if(m && !settled){
          settled=true; clearTimeout(timer);
          // Validate move is legal, else fallback
          const from=m[1].slice(0,2), to=m[1].slice(2,4);
          const legal=this.chess.moves({ square: from as Square, verbose:true } as any) as any[];
          const ok=legal.some((x:any)=>x.to===to);
          if(ok) res(m[1]);
          else res(pickRandomMove());
        }
      };
    });
  }
}
