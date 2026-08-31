import * as THREE from 'three';
import { Chess, Square } from 'chess.js';

/**
 * High-quality 3D Chess — Playable, humanized
 * Click piece → click destination, Stockfish replies, no auto-rotate
 */
export class ChessBoard3D {
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private renderer: THREE.WebGLRenderer;
  private chess = new Chess();
  private boardGroup = new THREE.Group();
  private pieces: Map<string, THREE.Mesh> = new Map();
  private squares: THREE.Mesh[] = [];
  private selected: string | null = null;
  private raycaster = new THREE.Raycaster();
  private mouse = new THREE.Vector2();
  private stockfish: Worker | null = null;

  constructor(containerId: string) {
    this.scene = new THREE.Scene(); this.scene.background = new THREE.Color(0x1e293b);
    this.camera = new THREE.PerspectiveCamera(45, window.innerWidth/window.innerHeight, 0.1, 1000);
    this.camera.position.set(0, 10, 6); this.camera.lookAt(0,0,0);
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    const container = document.getElementById(containerId) || document.body;
    // clear any previous canvas
    const old = container.querySelector('canvas');
    if (old) old.remove();
    // ensure container is body or app
    if (container.id === 'app') {
      container.appendChild(this.renderer.domElement);
    } else {
      document.body.appendChild(this.renderer.domElement);
    }
    this.renderer.domElement.style.display = 'block';
    this.renderer.domElement.style.margin = '0 auto';

    const sun = new THREE.DirectionalLight(0xffffff, 1.0); sun.position.set(5,10,5); sun.castShadow=true; sun.shadow.mapSize.set(2048,2048); this.scene.add(sun);
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x444444, 0.8));
    this.scene.add(new THREE.AmbientLight(0xffffff, 0.4));

    // Board 8x8 — humanized squares with userData
    for(let r=0;r<8;r++) for(let c=0;c<8;c++){
      const isLight = (r+c)%2===0;
      const sq = new THREE.Mesh(new THREE.BoxGeometry(1,0.2,1), new THREE.MeshStandardMaterial({ color: isLight?0xf0d9b5:0xb58863, roughness:0.8 }));
      sq.position.set(c-3.5, -0.1, r-3.5); sq.receiveShadow=true;
      (sq as any).userData = { square: String.fromCharCode(97+c)+(8-r), r, c };
      this.squares.push(sq);
      this.boardGroup.add(sq);
    }
    this.scene.add(this.boardGroup);
    this.createPieces();

    // Stockfish
    try { this.stockfish = new Worker('/stockfish.js'); } catch {}

    // Controls — click to move, drag to orbit
    this.renderer.domElement.addEventListener('click', this.onClick.bind(this));
    this.renderer.domElement.addEventListener('contextmenu', e=>e.preventDefault());
    let isDragging = false; let lastX=0;
    this.renderer.domElement.addEventListener('mousedown', e=>{ isDragging=true; lastX=e.clientX; });
    window.addEventListener('mouseup', ()=>isDragging=false);
    window.addEventListener('mousemove', e=>{
      if(isDragging){ const dx=e.clientX-lastX; this.boardGroup.rotation.y += dx*0.005; lastX=e.clientX; }
    });
    // touch
    this.renderer.domElement.addEventListener('touchstart', e=>{ lastX=e.touches[0].clientX; });
    this.renderer.domElement.addEventListener('touchmove', e=>{ const dx=e.touches[0].clientX-lastX; this.boardGroup.rotation.y+=dx*0.005; lastX=e.touches[0].clientX; e.preventDefault(); }, {passive:false});

    window.addEventListener('resize', ()=>{ this.camera.aspect=window.innerWidth/window.innerHeight; this.camera.updateProjectionMatrix(); this.renderer.setSize(window.innerWidth, window.innerHeight);});
    this.updateStatus();
  }

  private createPieces() {
    // Remove old pieces (keep 64 squares)
    this.boardGroup.children.slice(64).forEach(m=>this.boardGroup.remove(m));
    this.pieces.clear();
    const fen = this.chess.fen().split(' ')[0];
    let r=0,c=0;
    for(const ch of fen){
      if(ch==='/'){ r++; c=0; continue; }
      if(!isNaN(parseInt(ch))){ c+= parseInt(ch); continue; }
      const isWhite = ch===ch.toUpperCase();
      const color = isWhite?0xffffff:0x1f2937;
      const lower = ch.toLowerCase();
      const h = lower==='p'?0.6: lower==='k'?1.0 : lower==='q'?0.9 : 0.8;
      const geom = lower==='n' ? new THREE.ConeGeometry(0.35, h, 16) : new THREE.CylinderGeometry(0.3,0.35,h,16);
      const mat = new THREE.MeshStandardMaterial({ color, metalness:0.15, roughness:0.5 });
      const mesh = new THREE.Mesh(geom, mat);
      mesh.position.set(c-3.5, h/2 + 0.05, r-3.5);
      mesh.castShadow=true; mesh.receiveShadow=true;
      (mesh as any).userData = { square: String.fromCharCode(97+c)+(8-r), piece: ch };
      // add piece letter on top for clarity
      this.boardGroup.add(mesh); this.pieces.set(String.fromCharCode(97+c)+(8-r), mesh);
      c++;
    }
    // Highlight selected
    this.highlight();
  }

  private highlight() {
    // Reset square colors, highlight selected and legal moves
    this.squares.forEach(sq=>{
      const isLight = ((sq as any).userData.r + (sq as any).userData.c)%2===0;
      (sq.material as THREE.MeshStandardMaterial).color.set(isLight?0xf0d9b5:0xb58863);
      (sq.material as THREE.MeshStandardMaterial).emissive?.setHex(0x000000);
    });
    if(this.selected){
      const sq = this.squares.find(s=>(s as any).userData.square===this.selected);
      if(sq) (sq.material as THREE.MeshStandardMaterial).color.set(0x8fbc8f);
      // legal moves
      const moves = this.chess.moves({ square: this.selected as Square, verbose: true }) as any[];
      moves.forEach(m=>{
        const target = this.squares.find(s=>(s as any).userData.square===m.to);
        if(target) (target.material as THREE.MeshStandardMaterial).color.set(0x90ee90);
      });
    }
    // mark in-check king
    if(this.chess.inCheck()){
      const kingSq = this.findKing(this.chess.turn());
      const sq = this.squares.find(s=>(s as any).userData.square===kingSq);
      if(sq) (sq.material as THREE.MeshStandardMaterial).color.set(0xff6b6b);
    }
  }

  private findKing(color:'w'|'b'){
    const board = this.chess.board();
    for(let r=0;r<8;r++) for(let c=0;c<8;c++){
      const p=board[r][c];
      if(p && p.type==='k' && p.color===color) return String.fromCharCode(97+c)+(8-r);
    }
    return null;
  }

  private onClick(event: MouseEvent) {
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.mouse.x = ((event.clientX - rect.left)/rect.width)*2 -1;
    this.mouse.y = -((event.clientY - rect.top)/rect.height)*2 +1;
    this.raycaster.setFromCamera(this.mouse, this.camera);
    // Intersect squares first, then pieces
    const intersects = this.raycaster.intersectObjects(this.squares, false);
    let square: string | null = null;
    if(intersects.length>0){
      square = (intersects[0].object as any).userData.square;
    } else {
      // try pieces
      const pieceHits = this.raycaster.intersectObjects(Array.from(this.pieces.values()), false);
      if(pieceHits.length>0) square = (pieceHits[0].object as any).userData.square;
    }
    if(!square) return;
    this.handleSquareClick(square);
  }

  private handleSquareClick(square: string) {
    const piece = this.chess.get(square as Square);
    const turn = this.chess.turn();
    // If no selection, select own piece
    if(!this.selected){
      if(piece && piece.color===turn){
        this.selected = square;
        this.highlight();
      }
      return;
    }
    // If clicking same color piece, reselect
    if(piece && piece.color===turn){
      this.selected = square;
      this.highlight();
      return;
    }
    // Try move
    try{
      const move = this.chess.move({ from: this.selected as Square, to: square as Square, promotion: 'q' });
      if(move){
        this.selected = null;
        this.createPieces();
        this.updateStatus();
        this.highlight();
        // Check game over
        if(this.chess.isGameOver()){
          setTimeout(()=>alert(this.chess.isCheckmate() ? `Checkmate! ${turn==='w'?'Black':'White'} wins` : this.chess.isDraw() ? 'Draw!' : 'Game over'), 100);
          return;
        }
        // Stockfish reply as black after 400ms
        if(this.chess.turn()==='b'){
          setTimeout(async ()=>{
            const best = await this.bestMove(12);
            const from = best.slice(0,2), to = best.slice(2,4);
            try{ this.chess.move({from: from as Square, to: to as Square, promotion:'q'}); this.createPieces(); this.updateStatus(); this.highlight(); if(this.chess.isGameOver()) setTimeout(()=>alert('Game over'),100);} catch{}
          }, 400);
        }
      } else {
        this.selected = null; this.highlight();
      }
    } catch{
      this.selected = null; this.highlight();
    }
  }

  private updateStatus(){
    const status = document.getElementById('status');
    if(!status) return;
    if(this.chess.isCheckmate()) status.textContent = `Checkmate! ${this.chess.turn()==='w'?'Black':'White'} wins`;
    else if(this.chess.isDraw()) status.textContent = 'Draw!';
    else status.textContent = `${this.chess.turn()==='w'?'White':'Black'} to move${this.chess.inCheck()?' — Check!':''}`;
    const fen = document.getElementById('fen') as any;
    if(fen) fen.textContent = this.chess.fen();
  }

  start() {
    const animate = () => {
      requestAnimationFrame(animate);
      // subtle auto-orbit only if not dragging, can be disabled
      // this.boardGroup.rotation.y += 0.0003;
      this.renderer.render(this.scene, this.camera);
    };
    animate();
    this.updateStatus();
    // Instructions
    console.log('Click a piece (white), then a green highlighted square to move. Drag to rotate board.');
  }

  move(from:string,to:string){ try{ this.chess.move({from:from as Square,to:to as Square}); this.createPieces(); return true;} catch{ return false; } }
  bestMove(depth=12): Promise<string>{ return new Promise(res=>{ if(!this.stockfish){ res('e7e5'); return; } this.stockfish.postMessage(`position fen ${this.chess.fen()}`); this.stockfish.postMessage(`go depth ${depth}`); this.stockfish.onmessage=(e)=>{ const m=(e.data as string).match(/bestmove (\w+)/); if(m) res(m[1]);}; setTimeout(()=>res('e7e5'), 900); }); }
}
