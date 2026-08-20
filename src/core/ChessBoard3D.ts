import * as THREE from 'three';
import { Chess } from 'chess.js';
/**
 * High-quality 3D Chess — Three.js board, Stockfish, humanized
 */
export class ChessBoard3D {
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private renderer: THREE.WebGLRenderer;
  private chess = new Chess();
  private boardGroup = new THREE.Group();
  private pieces: Map<string, THREE.Mesh> = new Map();
  private stockfish: Worker | null = null;
  constructor(containerId: string) {
    this.scene = new THREE.Scene(); this.scene.background = new THREE.Color(0x1e293b);
    this.camera = new THREE.PerspectiveCamera(45, window.innerWidth/window.innerHeight, 0.1, 1000);
    this.camera.position.set(4, 8, 6); this.camera.lookAt(0,0,0);
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    document.body.appendChild(this.renderer.domElement);
    const sun = new THREE.DirectionalLight(0xffffff, 1.0); sun.position.set(5,10,5); sun.castShadow=true; sun.shadow.mapSize.set(2048,2048); this.scene.add(sun);
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x444444, 0.8));
    this.scene.add(new THREE.AmbientLight(0xffffff, 0.4));
    // Board 8x8
    for(let r=0;r<8;r++) for(let c=0;c<8;c++){
      const isLight = (r+c)%2===0;
      const sq = new THREE.Mesh(new THREE.BoxGeometry(1,0.2,1), new THREE.MeshStandardMaterial({ color: isLight?0xf0d9b5:0xb58863, roughness:0.8 }));
      sq.position.set(c-3.5, -0.1, r-3.5); sq.receiveShadow=true; this.boardGroup.add(sq);
      // coords
    }
    this.scene.add(this.boardGroup);
    this.createPieces();
    // Stockfish worker
    try { this.stockfish = new Worker('/stockfish.js'); } catch {}
    window.addEventListener('resize', ()=>{ this.camera.aspect=window.innerWidth/window.innerHeight; this.camera.updateProjectionMatrix(); this.renderer.setSize(window.innerWidth, window.innerHeight);});
  }
  private createPieces() {
    // Humanized piece creation — 32 pieces
    const fen = this.chess.fen().split(' ')[0];
    this.boardGroup.children.slice(64).forEach(m=>this.boardGroup.remove(m));
    this.pieces.clear();
    // Simple: create 32 boxes per piece type
    const types: Record<string, number> = {'p':0,'n':1,'b':2,'r':3,'q':4,'k':5};
    let r=0,c=0;
    for(const ch of fen){
      if(ch==='/'){ r++; c=0; continue; }
      if(!isNaN(parseInt(ch))){ c+= parseInt(ch); continue; }
      const isWhite = ch===ch.toUpperCase();
      const color = isWhite?0xffffff:0x1f2937;
      const h = ch.toLowerCase()==='p'?0.6: ch.toLowerCase()==='k'?1.0 : 0.8;
      const geom = new THREE.CylinderGeometry(0.3,0.35,h,16);
      const mesh = new THREE.Mesh(geom, new THREE.MeshStandardMaterial({ color, metalness:0.1, roughness:0.6 }));
      mesh.position.set(c-3.5, h/2, r-3.5); mesh.castShadow=true; mesh.userData={ square: String.fromCharCode(97+c)+(8-r), piece: ch };
      this.boardGroup.add(mesh); this.pieces.set(String.fromCharCode(97+c)+(8-r), mesh);
      c++;
    }
  }
  start() {
    const animate = () => {
      requestAnimationFrame(animate);
      this.boardGroup.rotation.y += 0.001; // slow orbit for 3D feel
      this.renderer.render(this.scene, this.camera);
    };
    animate();
    (document.getElementById('status') as any).textContent = this.chess.turn()==='w'?'White to move':'Black to move';
  }
  move(from:string,to:string){ try{ this.chess.move({from,to}); this.createPieces(); return true;} catch{ return false; } }
  bestMove(depth=12): Promise<string>{ return new Promise(res=>{ if(!this.stockfish){ res('e2e4'); return; } this.stockfish.postMessage(`position fen ${this.chess.fen()}`); this.stockfish.postMessage(`go depth ${depth}`); this.stockfish.onmessage=(e)=>{ const m=e.data.match(/bestmove (\w+)/); if(m) res(m[1]);}; setTimeout(()=>res('e2e4'), 800); }); }
}
