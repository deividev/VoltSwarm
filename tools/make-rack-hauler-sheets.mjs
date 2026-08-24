// Deterministically converts the approved Rack Hauler orthographic renders
// into flat, exact-palette RGBA sheets for the front-extrusion voxel pipeline.
// The source files contain a baked checker and lighting, so they must never be
// consumed directly by icon-voxelizer.
// Usage: node tools/make-rack-hauler-sheets.mjs [--debug]

import { deflateSync } from 'node:zlib';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import puppeteer from 'puppeteer-core';

const SOURCE_DIR = 'art/concept/rack-hauler';
const OUTPUT_DIR = 'public/assets/2d';
const SCALE = 12;
const ROWS = 68;
const FRONT_COLS = 41;
const DEBUG = process.argv.includes('--debug');

const COLORS = {
  B: [0x3b, 0x9b, 0x73, 255], // tool-green secondary armor
  S: [0xba, 0xe8, 0xc6, 255], // light seafoam dominant plates
  G: [0x20, 0x28, 0x30, 255], // graphite frame / recesses
  V: [0xe9, 0xf6, 0xff, 255], // visor
  '.': [0, 0, 0, 0],
};

const chromePath = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  `${process.env.LOCALAPPDATA}\\Google\\Chrome\\Application\\chrome.exe`,
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
].find(existsSync);
if (!chromePath) throw new Error('No Chrome/Edge executable found');

const browser = await puppeteer.launch({ executablePath: chromePath, headless: 'new' });
const page = await browser.newPage();

function hsv(r, g, b) {
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const v = max / 255;
  const s = max === 0 ? 0 : (max - min) / max;
  let h = 0;
  if (max !== min) {
    const d = max - min;
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  return { h, s, v };
}

async function readPixels(file) {
  const dataUrl = `data:image/png;base64,${readFileSync(`${SOURCE_DIR}/${file}`).toString('base64')}`;
  await page.setContent(`<img id="src" src="${dataUrl}">`);
  await page.waitForFunction('document.getElementById("src").complete');
  return page.evaluate(() => {
    const img = document.getElementById('src');
    const canvas = document.createElement('canvas');
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(img, 0, 0);
    return { width: canvas.width, height: canvas.height, data: [...ctx.getImageData(0, 0, canvas.width, canvas.height).data] };
  });
}

function isSubject(r, g, b) {
  const { h, s, v } = hsv(r, g, b);
  // The checker is neutral and bright. The subject is either dark graphite or
  // visibly blue steel/cobalt. This excludes the neutral grey cast shadow.
  return v < 0.46 || (h >= 175 && h <= 250 && s > 0.075) ||
    (v > 0.8 && h >= 175 && h < 205 && s > 0.025);
}

function classify(r, g, b) {
  const { h, s, v } = hsv(r, g, b);
  // The visor is the only bright cyan surface (steel is bluer, hue ~210+).
  // Lighting pulls its value below the nominal #E9F6FF value in the renders.
  if (v > 0.78 && h >= 175 && h < 205 && s >= 0.055 && s < 0.24) return 'V';
  if (v < 0.43 || s < 0.075) return 'G';
  if (s > 0.42 && h >= 205 && h <= 245) return 'B';
  return 'S';
}

function bboxOfSubject(image) {
  // ImageGen occasionally leaves a few dark pixels at the canvas border.
  // Select the largest 4-connected subject component before measuring instead
  // of allowing those export artefacts to expand the model bbox.
  const w=image.width,h=image.height,seen=new Uint8Array(w*h); let best=null;
  const on=(x,y)=>{const i=(y*w+x)*4;return isSubject(image.data[i],image.data[i+1],image.data[i+2]);};
  for(let y=0;y<h;y++) for(let x=0;x<w;x++){
    const p=y*w+x;if(seen[p]||!on(x,y))continue;
    let x0=x,x1=x,y0=y,y1=y,n=0;const stack=[p];seen[p]=1;
    while(stack.length){const q=stack.pop(),cx=q%w,cy=(q/w)|0;n++;x0=Math.min(x0,cx);x1=Math.max(x1,cx);y0=Math.min(y0,cy);y1=Math.max(y1,cy);
      for(const [nx,ny] of [[cx+1,cy],[cx-1,cy],[cx,cy+1],[cx,cy-1]]){if(nx<0||ny<0||nx>=w||ny>=h)continue;const np=ny*w+nx;if(!seen[np]&&on(nx,ny)){seen[np]=1;stack.push(np);}}
    }
    if(!best||n>best.n)best={x0,y0,x1,y1,n};
  }
  if(!best) throw new Error('No subject pixels detected');
  const {x0,y0,x1,y1}=best;
  return { x0, y0, x1, y1, width: x1 - x0 + 1, height: y1 - y0 + 1 };
}

function resample(image, box, cols, rows) {
  const grid = [];
  for (let gy = 0; gy < rows; gy++) {
    let row = '';
    for (let gx = 0; gx < cols; gx++) {
      const px0 = box.x0 + Math.floor(gx * box.width / cols);
      const px1 = box.x0 + Math.max(1, Math.floor((gx + 1) * box.width / cols));
      const py0 = box.y0 + Math.floor(gy * box.height / rows);
      const py1 = box.y0 + Math.max(1, Math.floor((gy + 1) * box.height / rows));
      const votes = { B: 0, S: 0, G: 0, V: 0, '.': 0 };
      for (let y = py0; y < py1; y++) for (let x = px0; x < px1; x++) {
        const i = (y * image.width + x) * 4;
        const r = image.data[i], g = image.data[i + 1], b = image.data[i + 2];
        votes[isSubject(r, g, b) ? classify(r, g, b) : '.']++;
      }
      const total = Object.values(votes).reduce((a, b) => a + b, 0);
      if (votes['.'] > total * 0.55) row += '.';
      else if (votes.V >= Math.max(2, total * 0.12)) row += 'V';
      else row += ['B', 'S', 'G', 'V'].sort((a, b) => votes[b] - votes[a])[0];
    }
    grid.push(row);
  }
  return grid;
}

function despeckle(grid) {
  const h = grid.length, w = grid[0].length;
  const at = (x, y) => x < 0 || y < 0 || x >= w || y >= h ? '.' : grid[y][x];
  const out = grid.map((r) => [...r]);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const near = [[1,0],[-1,0],[0,1],[0,-1]].map(([dx,dy]) => at(x+dx,y+dy));
    if (grid[y][x] !== '.' && near.every((c) => c === '.')) out[y][x] = '.';
    if (grid[y][x] === '.' && near.every((c) => c !== '.')) out[y][x] = near.sort((a,b) => near.filter(c=>c===b).length-near.filter(c=>c===a).length)[0];
  }
  return out.map((r) => r.join(''));
}

/** The approved top view shows four LOW cradles on the shoulder line. The
 * front/back renders make their top faces visible in perspective, which the
 * raw silhouette converter mistakes for tall vertical towers. Remove only
 * that perspective-only material above the shoulder deck; rows 11-14 remain
 * the low housing and rows below remain the real upper arms. */
function flattenDockingTowers(grid) {
  return grid.map((row, y) => {
    if (y > 10) return row;
    const cells = [...row];
    for (let x = 0; x < cells.length; x++) {
      if (x <= 9 || x >= cells.length - 10) cells[x] = '.';
    }
    return cells.join('');
  });
}

/** Convert the full-body cenital reference into a top-paint authority without
 * losing its connected silhouette. Graphite is allowed to project only in the
 * four measured 6x4 docking recesses; all other graphite becomes plate color.
 * This prevents arbitrary dark body details from being projected across the
 * symmetric extrusion depth while retaining exactly four readable sockets. */
function isolateTopDockingRecesses(grid) {
  return grid.map((row, y) => [...row].map((cell, x) => {
    if (cell !== 'G') return cell;
    const inRail = (x >= 3 && x <= 8) || (x >= 32 && x <= 37);
    const inSocket = (y >= 2 && y <= 5) || (y >= 8 && y <= 11);
    return inRail && inSocket ? 'G' : 'S';
  }).join(''));
}

function components(grid) {
  const h = grid.length, w = grid[0].length, seen = new Uint8Array(w*h), sizes = [];
  for (let y=0;y<h;y++) for (let x=0;x<w;x++) {
    const start=y*w+x; if (seen[start] || grid[y][x] === '.') continue;
    let n=0; const stack=[[x,y]]; seen[start]=1;
    while(stack.length){ const [cx,cy]=stack.pop(); n++;
      for(const [nx,ny] of [[cx+1,cy],[cx-1,cy],[cx,cy+1],[cx,cy-1]]){
        if(nx<0||ny<0||nx>=w||ny>=h) continue; const p=ny*w+nx;
        if(!seen[p]&&grid[ny][nx]!=='.'){seen[p]=1;stack.push([nx,ny]);}
      }
    } sizes.push(n);
  }
  return sizes.sort((a,b)=>b-a);
}

function colorComponents(grid, color) {
  const h=grid.length,w=grid[0].length,seen=new Uint8Array(w*h),sizes=[];
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){
    const p=y*w+x;if(seen[p]||grid[y][x]!==color)continue;
    let n=0;const stack=[[x,y]];seen[p]=1;
    while(stack.length){const [cx,cy]=stack.pop();n++;for(const [nx,ny] of [[cx+1,cy],[cx-1,cy],[cx,cy+1],[cx,cy-1]]){if(nx<0||ny<0||nx>=w||ny>=h)continue;const np=ny*w+nx;if(!seen[np]&&grid[ny][nx]===color){seen[np]=1;stack.push([nx,ny]);}}}sizes.push(n);
  }
  return sizes.sort((a,b)=>b-a);
}

let crcTable;
function crc32(buf) {
  if (!crcTable) { crcTable = new Int32Array(256); for(let n=0;n<256;n++){let c=n;for(let k=0;k<8;k++)c=c&1?0xedb88320^(c>>>1):c>>>1;crcTable[n]=c;} }
  let c=-1; for(const b of buf)c=crcTable[(c^b)&255]^(c>>>8); return c^-1;
}
function chunk(type,data){const len=Buffer.alloc(4);len.writeUInt32BE(data.length);const body=Buffer.concat([Buffer.from(type),data]);const crc=Buffer.alloc(4);crc.writeUInt32BE(crc32(body)>>>0);return Buffer.concat([len,body,crc]);}
function writePng(path, grid) {
  const width=grid[0].length*SCALE,height=grid.length*SCALE,raw=Buffer.alloc((width*4+1)*height);
  for(let y=0;y<height;y++){let o=y*(width*4+1);raw[o++]=0;const row=grid[Math.floor(y/SCALE)];for(let x=0;x<width;x++){const c=COLORS[row[Math.floor(x/SCALE)]];raw[o++]=c[0];raw[o++]=c[1];raw[o++]=c[2];raw[o++]=c[3];}}
  const ihdr=Buffer.alloc(13);ihdr.writeUInt32BE(width,0);ihdr.writeUInt32BE(height,4);ihdr[8]=8;ihdr[9]=6;
  writeFileSync(path,Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',ihdr),chunk('IDAT',deflateSync(raw,{level:9})),chunk('IEND',Buffer.alloc(0))]));
  console.log(`${path} — ${width}x${height} (${grid[0].length}x${grid.length} cells)`);
}

const specs = [
  ['front', 'rack-hauler-ref-front-v1.png', FRONT_COLS, ROWS],
  ['side', 'rack-hauler-ref-side-v1.png', null, ROWS],
  ['back', 'rack-hauler-ref-back-v1.png', FRONT_COLS, ROWS],
  ['top', 'rack-hauler-ref-top-v1.png', FRONT_COLS, null],
];
for (const [name,file,fixedCols,fixedRows] of specs) {
  const image=await readPixels(file), box=bboxOfSubject(image);
  const rows=fixedRows ?? Math.round(FRONT_COLS * box.height / box.width);
  const cols=fixedCols ?? Math.max(12,Math.round(ROWS * box.width / box.height));
  let grid=despeckle(resample(image,box,cols,rows));
  if (name === 'front' || name === 'back') grid = flattenDockingTowers(grid);
  if (name === 'top') grid = isolateTopDockingRecesses(grid);
  const pieces=components(grid);
  console.log(`${name} bbox ${box.width}x${box.height}; components ${pieces.length}: ${pieces.slice(0,8).join(', ')}`);
  if (name === 'top') {
    const sockets=colorComponents(grid,'G');
    console.log(`top graphite docking recesses ${sockets.length}: ${sockets.join(', ')}`);
    if (sockets.length !== 4) throw new Error(`Expected 4 top docking recesses, found ${sockets.length}`);
  }
  if (DEBUG) grid.forEach((r)=>console.log(r));
  writePng(`${OUTPUT_DIR}/ref-rack-hauler-${name}-v3-seafoam.png`,grid);
}
await browser.close();
