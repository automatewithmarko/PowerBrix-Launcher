// Pure game rules shared by the renderer and regression tests. No network or engine work.
(function(scope){
  const shapes=[[[1,1,1,1]],[[1,1],[1,1]],[[0,1,0],[1,1,1]],[[0,1,1],[1,1,0]],[[1,1,0],[0,1,1]],[[1,0,0],[1,1,1]],[[0,0,1],[1,1,1]]];
  class Tetris {
    constructor(random=Math.random){this.random=random;this.reset();}
    reset(){this.board=Array.from({length:20},()=>Array(10).fill(0));this.bag=[];this.score=0;this.lines=0;this.over=false;this.next=this.pick();this.spawn();}
    pick(){
      if(!this.bag.length){this.bag=[0,1,2,3,4,5,6];for(let i=6;i>0;i--){const j=Math.floor(this.random()*(i+1));[this.bag[i],this.bag[j]]=[this.bag[j],this.bag[i]];}}
      return this.bag.pop();
    }
    spawn(){const id=this.next;this.next=this.pick();this.piece={id:id+1,shape:shapes[id].map(row=>[...row]),x:3,y:0};if(!this.fits(this.piece.shape,this.piece.x,this.piece.y))this.over=true;}
    fits(shape,x,y){return shape.every((row,dy)=>row.every((cell,dx)=>!cell || (x+dx>=0&&x+dx<10&&y+dy>=0&&y+dy<20&&!this.board[y+dy][x+dx])));}
    move(dx){if(this.over)return false;if(!this.fits(this.piece.shape,this.piece.x+dx,this.piece.y))return false;this.piece.x+=dx;return true;}
    rotate(){
      if(this.over)return false;const s=this.piece.shape;const rotated=s[0].map((_,x)=>s.map(row=>row[x]).reverse());
      for(const dx of [0,-1,1,-2,2])if(this.fits(rotated,this.piece.x+dx,this.piece.y)){this.piece.shape=rotated;this.piece.x+=dx;return true;}return false;
    }
    down(soft=false){if(this.over)return false;if(this.fits(this.piece.shape,this.piece.x,this.piece.y+1)){this.piece.y++;if(soft)this.score++;return true;}this.lock();return false;}
    drop(){if(this.over)return;while(this.fits(this.piece.shape,this.piece.x,this.piece.y+1)){this.piece.y++;this.score+=2;}this.lock();}
    lock(){
      for(let y=0;y<this.piece.shape.length;y++)for(let x=0;x<this.piece.shape[y].length;x++)if(this.piece.shape[y][x])this.board[this.piece.y+y][this.piece.x+x]=this.piece.id;
      const remaining=this.board.filter(row=>row.some(cell=>!cell));const count=20-remaining.length;
      this.board=[...Array.from({length:count},()=>Array(10).fill(0)),...remaining];
      this.score+=[0,100,300,500,800][count]*(1+Math.floor(this.lines/10));this.lines+=count;this.spawn();
    }
    ghostY(){let y=this.piece.y;while(this.fits(this.piece.shape,this.piece.x,y+1))y++;return y;}
    preview(){return shapes[this.next].map(row=>[...row]);}
  }
  if(typeof module!=='undefined'&&module.exports)module.exports={Tetris};else scope.PowerBrixTetris=Tetris;
})(globalThis);
