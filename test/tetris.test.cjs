const {test}=require('node:test');
const assert=require('node:assert/strict');
const {Tetris}=require('../renderer/tetris.js');

test('pieces stay within the board and hard drops lock them',()=>{
  const game=new Tetris(()=>.5);
  for(let n=0;n<20;n++)game.move(-1);
  assert.equal(game.piece.x,0);
  assert.equal(game.move(-1),false);
  const y=game.ghostY();assert.ok(y>0);
  game.drop();
  assert.equal(game.board.flat().filter(Boolean).length,4);
  assert.ok(game.score>=y*2);
  assert.equal(game.piece.y,0);
});
test('clearing a line compacts the board and awards points',()=>{
  const game=new Tetris();
  game.board[19]=[1,1,1,1,1,1,1,1,0,0];
  game.piece={id:2,shape:[[1,1],[1,1]],x:8,y:18};
  game.lock();
  assert.equal(game.lines,1);
  assert.equal(game.score,100);
  assert.equal(game.board.length,20);
  assert.equal(game.board[19][8],2);
  assert.ok(game.board[0].every(cell=>cell===0));
});
test('rotation is blocked by occupied cells and allowed in free space',()=>{
  const game=new Tetris();
  game.piece={id:1,shape:[[1,1,1,1]],x:3,y:0};
  assert.equal(game.rotate(),true);
  assert.equal(game.piece.shape.length,4);
  game.board=Array.from({length:20},()=>Array(10).fill(1));
  assert.equal(game.rotate(),false);
});
test('a blocked spawn ends the game and restart clears it',()=>{
  const game=new Tetris();
  game.board=Array.from({length:20},()=>Array(10).fill(1));
  game.spawn();assert.equal(game.over,true);
  const snapshot=JSON.stringify(game.board);game.drop();assert.equal(JSON.stringify(game.board),snapshot);
  game.reset();assert.equal(game.over,false);assert.equal(game.score,0);assert.equal(game.lines,0);
  assert.ok(game.board.flat().every(cell=>cell===0));
});
test('each bag contains all seven pieces',()=>{
  const game=new Tetris(()=>.33);const ids=[game.piece.id-1,game.next];
  for(let n=0;n<5;n++)ids.push(game.pick());
  assert.equal(new Set(ids).size,7);
});
