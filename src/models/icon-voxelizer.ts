import { emptyGrid } from './voxel-builder';
import type { VoxelGrid } from './voxel-builder';

/**
 * Turns a flat front-view reference PNG into a voxel model: the image
 * becomes the front (+Z) face, extruded backward with per-segment dome
 * profiles so the result reads as solid armor rather than a billboard.
 * Pixels are quantized to the art-direction palette, so AI shading
 * collapses back to flat colors.
 */

type FrontMap = (number | null)[][];

export interface IconVoxelizeOptions {
  /** Target voxel width of the model; height follows the image's aspect. */
  targetWidth: number;
  /** Optional explicit voxel-row count. This resamples the approved sheets
   * vertically while keeping X/Z dimensions reference-measured and voxels
   * cubic; use it instead of non-uniform Object3D scaling. */
  targetHeight?: number;
  /** Max half-depth as a fraction of width (dome roundness). Default 0.38. */
  depthFactor?: number;
  /**
   * Fraction of rows (from the top) where dark details sit PROUD of the
   * armor (crest vents) instead of sinking in (grilles). Default 0.32.
   */
  raisedTopFraction?: number;
  /**
   * Vertical bands (fractions of height, top-down) extruded with their own
   * depth profile — head, torso, skirt. Without segments a full-body image
   * shares one front surface and volumes turn to mush. Bands should cover
   * [0, 1]; each row uses the first band containing it.
   */
  segments?: { from: number; to: number; depthFactor?: number }[];
  /**
   * Colors treated as background (dropped). Everything else snaps to the
   * nearest entry in `palette`.
   */
  background: number[];
  palette: number[];
  /**
   * Colors that only exist on the front face (e.g. the visor cyan); on the
   * sides/back of the extrusion they are replaced with armor.
   */
  frontOnly: number[];
  /**
   * Colors that ARE the character's armor/hull. Everything else (joints,
   * grilles, visors) is a surface detail that carves relief and backfills
   * with the nearest armor color in its row. Defaults to [bodyColor].
   */
  armorColors?: number[];
  bodyColor: number;
  /**
   * Mirrors the front face onto the back shell — for bodies that show both
   * faces in motion (the rolling Roller shows front and back every turn).
   */
  mirrorBack?: boolean;
  /**
   * Spherical depth profile: depth shrinks with row distance from the
   * vertical center too, turning the column-cylinder into a ball. Without
   * it a circular silhouette extrudes into a barrel.
   */
  sphericalDepth?: boolean;
  /**
   * Gradual vertical dome (0..1): tapers depth toward the model's top and
   * bottom rows so side/back views read ROUNDED instead of slab-sided —
   * the "square from behind" complaint (2026-07-09). 0/absent keeps the
   * legacy column-cylinder (approved models unchanged); 1 equals the full
   * sphericalDepth falloff. The 0.15 roundness floor below still guarantees
   * thin rows never collapse to paper.
   */
  verticalRoundness?: number;
  /**
   * Colors that protrude from the armor instead of sinking in — muzzle
   * rings, raised plates. A frontal drawing can't express depth; this is
   * how "this part pokes out" is annotated.
   */
  raisedColors?: number[];
  /**
   * FLAT side-profile sheet (object's front at the image's RIGHT edge, same
   * vertical extent as the front sheet). When given, each row's depth is
   * MEASURED from the sheet's real filled span instead of the parametric
   * segment/dome guess — hunches, backpacks and hoods come from data
   * (2026-07-09). Columns still fall off toward the silhouette edges (1−t²)
   * so bodies stay rounded left-to-right. Unlike voxelizeMultiView this only
   * MODULATES the front extrusion, so it cannot phantom-fill hollow shapes.
   */
  sideProfileRef?: string;
  /**
   * FLAT back sheet (same vertical extent as the front). When given, the
   * back shell is painted from it (mirrored) instead of armor backfill —
   * the back view becomes real reference detail (2026-07-09).
   */
  backPaintRef?: string;
  /** FLAT top sheet (front of the object at the image bottom). Selected paint
   * colors are projected onto the highest occupied voxel at each X/Z cell,
   * preserving the measured shell and the one-geometry instancing path. */
  topPaintRef?: string;
  /** Restricts top projection to macro accents that the gameplay camera must
   * read; absent means every non-background top pixel may paint the shell. */
  topPaintColors?: number[];
  /**
   * Uses the side sheet's COLOURS, not just its depth, to paint the model's
   * outermost left/right faces (2026-07-31).
   *
   * Without this the side sheet is consumed for `rowHalfDepth` alone and its
   * pixels are thrown away, so every flank wears whatever colour happens to
   * sit at the FRONT sheet's silhouette edge, smeared backwards through the
   * whole depth. On a character with trim along its outline that reads as
   * long stripes, and it is the single weakest angle of this path.
   *
   * The side sheet literally IS the picture of the flank, and the flank is
   * exactly the min/max filled X of each (y, z) — so this paints real data
   * and cannot change the silhouette. That is the difference from switching
   * to `voxelizeMultiView`, which also paints real side colour but carves the
   * hull as a cross product and FUSES limbs that hang clear of the body.
   */
  sidePaint?: boolean;
  /**
   * Skips the left-right symmetrization pass (2026-08-03).
   *
   * `symmetrizeFront` exists because most of this cast IS symmetric, and there
   * a downsampling artefact that breaks the mirror reads as damage. But it
   * fills any gap on one side with whatever the other side has — so on an
   * ASYMMETRIC character it is destructive: the field engineer holds a tool
   * with one arm raised and the other down, and symmetrization packed the
   * armpit gaps solid, fusing both arms and both legs into the torso as one
   * slab. Measured: the sheets carry real transparent gaps up to 51 px wide
   * (over 6 cells) and they were surviving the downsample intact — this pass
   * was what closed them.
   *
   * Set it on any model whose reference is deliberately asymmetric.
   */
  asymmetric?: boolean;
}

/** A reference image quantized to the palette, with its content bbox. */
interface ClassifiedImage {
  classified: Int32Array;
  width: number;
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

async function classifyImage(
  url: string,
  background: number[],
  palette: number[],
): Promise<ClassifiedImage> {
  const image = await loadImage(url);
  const canvas = document.createElement('canvas');
  canvas.width = image.naturalWidth;
  canvas.height = image.naturalHeight;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('2D canvas context unavailable');
  ctx.drawImage(image, 0, 0);
  const { data, width, height } = ctx.getImageData(0, 0, canvas.width, canvas.height);

  const swatches = [
    ...background.map((color) => ({ color, isBackground: true })),
    ...palette.map((color) => ({ color, isBackground: false })),
  ].map((entry) => ({ ...entry, rgb: splitRgb(entry.color) }));

  // Classify every pixel, tracking the content bounding box.
  const classified = new Int32Array(width * height).fill(-1);
  let minX = width;
  let maxX = -1;
  let minY = height;
  let maxY = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const r = data[i] ?? 0;
      const g = data[i + 1] ?? 0;
      const b = data[i + 2] ?? 0;
      const alpha = data[i + 3] ?? 0;
      if (alpha < 128) continue;
      let best: (typeof swatches)[number] | null = null;
      let bestDist = Infinity;
      for (const swatch of swatches) {
        const d = colorDistance(r, g, b, swatch.rgb);
        if (d < bestDist) {
          bestDist = d;
          best = swatch;
        }
      }
      if (!best || best.isBackground) continue;
      classified[y * width + x] = best.color;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
  if (maxX < 0) throw new Error(`Image at ${url} has no foreground pixels after quantization`);
  return { classified, width, minX, maxX, minY, maxY };
}

/** Downsamples a classified image's content bbox to gridW × gridH by
 *  majority vote per cell. */
function downsampleMap(img: ClassifiedImage, gridW: number, gridH: number): FrontMap {
  const { classified, width, minX, maxX, minY, maxY } = img;
  const bboxW = maxX - minX + 1;
  const bboxH = maxY - minY + 1;
  const map: FrontMap = [];
  for (let gy = 0; gy < gridH; gy++) {
    const row: (number | null)[] = [];
    for (let gx = 0; gx < gridW; gx++) {
      const x0 = minX + Math.floor((gx / gridW) * bboxW);
      const x1 = minX + Math.max(x0 - minX + 1, Math.floor(((gx + 1) / gridW) * bboxW));
      const y0 = minY + Math.floor((gy / gridH) * bboxH);
      const y1 = minY + Math.max(y0 - minY + 1, Math.floor(((gy + 1) / gridH) * bboxH));
      row.push(majorityColor(classified, width, x0, x1, y0, y1));
    }
    map.push(row);
  }
  return map;
}

export async function voxelizeIcon(url: string, options: IconVoxelizeOptions): Promise<VoxelGrid> {
  const image = await classifyImage(url, options.background, options.palette);
  const gridW = options.targetWidth;
  const bboxW = image.maxX - image.minX + 1;
  const bboxH = image.maxY - image.minY + 1;
  const gridH = options.targetHeight ?? Math.max(1, Math.round((bboxH / bboxW) * gridW));
  const front = downsampleMap(image, gridW, gridH);

  cleanupFront(front);
  if (!options.asymmetric) symmetrizeFront(front);

  // Extrusion. Each vertical band (head/torso/skirt) gets its own per-column
  // depth profile: row-local profiles produce a ragged surface, one global
  // profile turns multi-volume bodies to mush. Depth is quantized to steps
  // of 2 so the silhouette reads as deliberate stepped armor plates.
  const defaultDepth = options.depthFactor ?? 0.38;
  const segments = (options.segments ?? [{ from: 0, to: 1, depthFactor: defaultDepth }]).map(
    (segment) => ({
      rowFrom: Math.floor(segment.from * gridH),
      rowTo: Math.ceil(segment.to * gridH),
      depthFactor: segment.depthFactor ?? defaultDepth,
      cx: (gridW - 1) / 2,
      halfW: gridW / 2,
      maxHalfDepth: 2,
    }),
  );
  for (const segment of segments) {
    let segMinX = gridW;
    let segMaxX = -1;
    for (let gy = segment.rowFrom; gy < Math.min(segment.rowTo, gridH); gy++) {
      const row = front[gy];
      if (!row) continue;
      for (let gx = 0; gx < gridW; gx++) {
        if (row[gx] == null) continue;
        if (gx < segMinX) segMinX = gx;
        if (gx > segMaxX) segMaxX = gx;
      }
    }
    if (segMaxX < 0) continue;
    segment.cx = (segMinX + segMaxX) / 2;
    segment.halfW = Math.max(1, (segMaxX - segMinX + 1) / 2);
    segment.maxHalfDepth = Math.max(2, Math.round(segment.halfW * 2 * segment.depthFactor));
  }

  // Side-profile sheet: per-row half-depth measured from the real profile.
  // Rows align by height fraction; the depth scale follows from cubic voxels
  // (side sheet width px → voxels at the same px-per-voxel as its height).
  let rowHalfDepth: number[] | null = null;
  let sideMap: FrontMap | null = null;
  if (options.sideProfileRef) {
    const side = await classifyImage(options.sideProfileRef, options.background, options.palette);
    const sideBboxW = side.maxX - side.minX + 1;
    const sideBboxH = side.maxY - side.minY + 1;
    // An explicit height stretches only the shared vertical sampling. Depth
    // remains measured against the front sheet's width, so making a character
    // taller does not also make it deeper/heavier.
    const sideGridW = Math.max(
      2,
      options.targetHeight
        ? Math.round((sideBboxW / bboxW) * gridW)
        : Math.round((sideBboxW / sideBboxH) * gridH),
    );
    sideMap = downsampleMap(side, sideGridW, gridH);
    rowHalfDepth = sideMap.map((row) => {
      let filled = 0;
      for (const cell of row) if (cell != null) filled++;
      return Math.max(2, Math.round(filled / 2));
    });
  }

  // Back sheet: colors for the back shell, mirrored (a back view shows the
  // object's left on the image's right).
  let backMap: FrontMap | null = null;
  if (options.backPaintRef) {
    const back = await classifyImage(options.backPaintRef, options.background, options.palette);
    backMap = downsampleMap(back, gridW, gridH);
  }

  const topImage = options.topPaintRef
    ? await classifyImage(options.topPaintRef, options.background, options.palette)
    : null;

  const deepest = Math.max(
    ...segments.map((s) => s.maxHalfDepth),
    ...(rowHalfDepth ?? [0]),
  );
  // Extra front slots for raised details (crest vents, muzzle rings).
  const gridD = deepest * 2 + 3;
  const grid = emptyGrid(gridW, gridH, gridD);
  const topMap = topImage ? downsampleMap(topImage, gridW, gridD) : null;
  const frontOnly = new Set(options.frontOnly);
  const raisedSet = new Set(options.raisedColors ?? []);

  // Armor vs detail is explicit (registry armorColors): heuristics that
  // guessed the armor per row broke on multi-color characters and on rows
  // where joints outnumber hull (zebra-striped backfill).
  const armorSet = new Set(options.armorColors ?? [options.bodyColor]);
  const nearestArmor = (row: (number | null)[], gx: number): number | null => {
    for (let d = 1; d < gridW; d++) {
      const left = row[gx - d];
      if (left != null && armorSet.has(left)) return left;
      const right = row[gx + d];
      if (right != null && armorSet.has(right)) return right;
    }
    return null;
  };

  for (let gy = 0; gy < gridH; gy++) {
    const row = front[gy];
    if (!row) continue;
    const segment =
      segments.find((s) => gy >= s.rowFrom && gy < s.rowTo) ?? segments[segments.length - 1];
    if (!segment) continue;
    for (let gx = 0; gx < gridW; gx++) {
      const color = row[gx];
      if (color == null) continue;
      const t = Math.min(1, Math.abs(gx - segment.cx) / segment.halfW);
      let roundness = 1 - t * t;
      // With a measured side profile the vertical shape IS the data — the
      // parametric dome only applies on the legacy path.
      if (!rowHalfDepth) {
        const verticalDome = options.sphericalDepth ? 1 : (options.verticalRoundness ?? 0);
        if (verticalDome > 0) {
          const ny = Math.min(1, Math.abs(gy - (gridH - 1) / 2) / (gridH / 2));
          roundness -= ny * ny * verticalDome;
        }
      }
      const rowMaxHalf = rowHalfDepth?.[gy] ?? segment.maxHalfDepth;
      const rawDepth = rowMaxHalf * Math.sqrt(Math.max(0.15, roundness));
      const halfDepth = Math.min(rowMaxHalf, Math.max(2, Math.round(rawDepth / 2) * 2));

      // Face relief: visor glass and dark grilles sink into the armor so the
      // armor brow/jaw overhangs read like the icon; dark details on the
      // helmet crest (top rows) sit PROUD instead — the icon's vent is a
      // raised block, not a hole. A detail counts as interior when armor
      // encloses it horizontally; silhouette extremes (ears, treads) keep
      // their color and full depth or the outline shreds.
      const isDetail = !armorSet.has(color);
      let hasArmorLeft = false;
      let hasArmorRight = false;
      if (isDetail) {
        for (let x = 0; x < gx; x++) {
          const c = row[x];
          if (c != null && armorSet.has(c)) {
            hasArmorLeft = true;
            break;
          }
        }
        for (let x = gx + 1; x < gridW; x++) {
          const c = row[x];
          if (c != null && armorSet.has(c)) {
            hasArmorRight = true;
            break;
          }
        }
      }
      const isCrestRow = gy < gridH * (options.raisedTopFraction ?? 0.32);
      // Crest details may poke above the armor silhouette (no armor beside
      // them) — armor below in the same column still marks them as surface
      // details, not silhouette extremes.
      let hasArmorBelow = false;
      if (isDetail && isCrestRow && !(hasArmorLeft && hasArmorRight)) {
        for (let y = gy + 1; y < gridH; y++) {
          const c = front[y]?.[gx];
          if (c != null && armorSet.has(c)) {
            hasArmorBelow = true;
            break;
          }
        }
      }
      const isInteriorDetail =
        isDetail && ((hasArmorLeft && hasArmorRight) || (isCrestRow && hasArmorBelow));
      let inset = 0;
      if (raisedSet.has(color)) inset = -2;
      else if (frontOnly.has(color)) inset = 2;
      else if (isInteriorDetail) inset = isCrestRow ? -1 : 1;
      const frontDepth = Math.max(
        -halfDepth + 1,
        Math.min(rowMaxHalf + 2, halfDepth - inset),
      );

      // Interior details (visor, grilles, vents) are surface features: the
      // fill behind them is the NEAREST armor color in the row (multi-color
      // characters backfill an orange head visor with orange, a white chest
      // grille with white). Silhouette-edge cells keep their color through
      // the depth.
      const backfills = frontOnly.has(color) || isInteriorDetail;
      const sideColor = backfills ? (nearestArmor(row, gx) ?? options.bodyColor) : color;
      // Back-sheet paint for this column (mirrored horizontally).
      const backPaint = backMap ? (backMap[gy]?.[gridW - 1 - gx] ?? null) : null;
      // Grid y is up; image y is down.
      const vy = gridH - 1 - gy;
      for (let dz = -halfDepth; dz <= frontDepth; dz++) {
        const gridRow = grid[vy]?.[deepest + dz];
        if (!gridRow) continue;
        const isFrontShell = dz >= frontDepth - 1;
        const isBackShell = dz <= -halfDepth + 1;
        if (isFrontShell) gridRow[gx] = color;
        else if (isBackShell && backPaint != null) gridRow[gx] = backPaint;
        else if (isBackShell && options.mirrorBack === true) gridRow[gx] = color;
        else gridRow[gx] = sideColor;
      }
    }
  }

  // Flank paint (see `sidePaint`): repaint the outermost left/right voxel of
  // every (y, z) with the colour the SIDE sheet shows there. Runs after the
  // extrusion so it overwrites the smeared silhouette-edge colour, and only
  // ever touches cells that are already filled — the silhouette is untouched.
  if (options.sidePaint && sideMap) {
    for (let vy = 0; vy < gridH; vy++) {
      const slice = grid[vy];
      const sideRow = sideMap[gridH - 1 - vy]; // grid y is up; image y is down
      if (!slice || !sideRow) continue;

      // The side sheet's own filled span for this row maps onto the model's
      // real depth span, so both ends line up regardless of per-row depth.
      let sLo = -1;
      let sHi = -1;
      for (let s = 0; s < sideRow.length; s++) {
        if (sideRow[s] == null) continue;
        if (sLo === -1) sLo = s;
        sHi = s;
      }
      if (sLo === -1) continue;
      let zLo = -1;
      let zHi = -1;
      for (let z = 0; z < slice.length; z++) {
        if (slice[z]?.some((c) => c != null)) {
          if (zLo === -1) zLo = z;
          zHi = z;
        }
      }
      if (zLo === -1) continue;

      for (let z = zLo; z <= zHi; z++) {
        const row = slice[z];
        if (!row) continue;
        let xLo = -1;
        let xHi = -1;
        for (let x = 0; x < row.length; x++) {
          if (row[x] == null) continue;
          if (xLo === -1) xLo = x;
          xHi = x;
        }
        if (xLo === -1) continue;
        const t = zHi === zLo ? 0 : (z - zLo) / (zHi - zLo);
        const s = Math.min(sHi, Math.max(sLo, Math.round(sLo + t * (sHi - sLo))));
        const paint = sideRow[s];
        if (paint == null) continue;
        row[xLo] = paint;
        row[xHi] = paint;
      }
    }
  }
  if (topMap) {
    const allowed = options.topPaintColors ? new Set(options.topPaintColors) : null;
    for (let z = 0; z < gridD; z++) {
      const topRow = topMap[z];
      if (!topRow) continue;
      for (let x = 0; x < gridW; x++) {
        const paint = topRow[x];
        if (paint == null || (allowed && !allowed.has(paint))) continue;
        for (let y = gridH - 1; y >= 0; y--) {
          const row = grid[y]?.[z];
          if (!row || row[x] == null) continue;
          row[x] = paint;
          break;
        }
      }
    }
  }
  return grid;
}

export interface MultiViewVoxelizeOptions {
  /** Target voxel width of the FRONT view; height and depth follow the
   *  images' aspect ratios. */
  targetWidth: number;
  background: number[];
  palette: number[];
}

/**
 * Builds a voxel model from three orthographic reference sheets — front,
 * side (profile) and back — by visual-hull carving: a voxel exists where the
 * front silhouette (x, y) AND the side silhouette (z, y) both have content.
 * Each shell is painted from the view that actually shows it (front face
 * from the front sheet, back face from the back sheet, everything between
 * from the side sheet), so side detail is real data instead of the guessed
 * elliptical falloff that voxelizeIcon uses for single-view characters.
 *
 * Sheet conventions: all three views share the same vertical extent (rows
 * align by height fraction); the side view depicts the object's profile
 * with the FRONT of the object at the RIGHT edge of the image.
 *
 * LIMITATION (found 2026-07-06, scaffold prop): this is a row-wise cross
 * product of "any filled front column" × "any filled side column", which is
 * only correct for objects that are genuinely SOLID through their depth (a
 * container's doors flush against a filled box). For a HOLLOW object whose
 * front/back and side faces each carry their OWN independent surface pattern
 * (e.g. a lattice tower with an X-brace on each face and open air between),
 * the cross product fills phantom combinations wherever both views happen to
 * have ANY content in that row, producing a solid interior even though each
 * sheet's own silhouette has real open gaps. For that shape family, use
 * voxelizeIcon (single front view, shallow depthFactor + mirrorBack) instead
 * — it only ever draws material directly behind an actual front pixel, so
 * gaps in the front sheet stay genuinely empty all the way through.
 */
export async function voxelizeMultiView(
  refs: { front: string; side: string; back?: string },
  options: MultiViewVoxelizeOptions,
): Promise<VoxelGrid> {
  const [frontImg, sideImg, backImg] = await Promise.all([
    classifyImage(refs.front, options.background, options.palette),
    classifyImage(refs.side, options.background, options.palette),
    refs.back
      ? classifyImage(refs.back, options.background, options.palette)
      : Promise.resolve(null),
  ]);

  const gridW = options.targetWidth;
  const frontBboxW = frontImg.maxX - frontImg.minX + 1;
  const frontBboxH = frontImg.maxY - frontImg.minY + 1;
  const gridH = Math.max(1, Math.round((frontBboxH / frontBboxW) * gridW));
  // Depth comes from the side view's aspect against the SHARED height.
  const sideBboxW = sideImg.maxX - sideImg.minX + 1;
  const sideBboxH = sideImg.maxY - sideImg.minY + 1;
  const gridD = Math.max(2, Math.round((sideBboxW / sideBboxH) * gridH));

  const front = downsampleMap(frontImg, gridW, gridH);
  const side = downsampleMap(sideImg, gridD, gridH);
  const back = backImg ? downsampleMap(backImg, gridW, gridH) : null;

  cleanupFront(front);
  symmetrizeFront(front);
  cleanupFront(side);
  if (back) {
    cleanupFront(back);
    symmetrizeFront(back);
  }

  const grid = emptyGrid(gridW, gridH, gridD);
  for (let gy = 0; gy < gridH; gy++) {
    const frontRow = front[gy];
    const sideRow = side[gy];
    if (!frontRow || !sideRow) continue;
    // The filled depth run of this row is read straight off the side sheet.
    let zMin = -1;
    let zMax = -1;
    for (let gz = 0; gz < gridD; gz++) {
      if (sideRow[gz] != null) {
        if (zMin === -1) zMin = gz;
        zMax = gz;
      }
    }
    if (zMin === -1) continue;
    const vy = gridH - 1 - gy; // grid y is up; image y is down
    for (let gx = 0; gx < gridW; gx++) {
      const frontColor = frontRow[gx];
      if (frontColor == null) continue;
      for (let gz = zMin; gz <= zMax; gz++) {
        const sideColor = sideRow[gz];
        if (sideColor == null) continue; // side-sheet gaps carve through
        // Paint each voxel from the sheet that shows it: the mid-depth run
        // only ever exposes side/top/bottom faces, so it wears the side
        // sheet's colors (corrugation ridges, hazard stripes). The back
        // sheet is horizontally mirrored — it is drawn looking at the back.
        let color = sideColor;
        if (gz === zMax) color = frontColor;
        else if (gz === zMin) color = back?.[gy]?.[gridW - 1 - gx] ?? frontColor;
        const gridRow = grid[vy]?.[gz];
        if (gridRow) gridRow[gx] = color;
      }
    }
  }
  return grid;
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`Failed to load ${url}`));
    image.src = url;
  });
}

function splitRgb(color: number): [number, number, number] {
  return [(color >> 16) & 0xff, (color >> 8) & 0xff, color & 0xff];
}

function colorDistance(r: number, g: number, b: number, rgb: [number, number, number]): number {
  const dr = r - rgb[0];
  const dg = g - rgb[1];
  const db = b - rgb[2];
  return dr * dr + dg * dg + db * db;
}

function majorityColor(
  classified: Int32Array,
  width: number,
  x0: number,
  x1: number,
  y0: number,
  y1: number,
): number | null {
  const votes = new Map<number, number>();
  let filled = 0;
  let total = 0;
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      total++;
      const color = classified[y * width + x] ?? -1;
      if (color < 0) continue;
      filled++;
      votes.set(color, (votes.get(color) ?? 0) + 1);
    }
  }
  // Cell is empty when background dominates.
  if (filled * 2 < total) return null;
  let best: number | null = null;
  let bestVotes = 0;
  for (const [color, count] of votes) {
    if (count > bestVotes) {
      bestVotes = count;
      best = color;
    }
  }
  return best;
}

/**
 * Enforces left-right symmetry: robots in this art direction are symmetric,
 * and downsampling artifacts that break the mirror read as damage.
 */
function symmetrizeFront(front: FrontMap): void {
  for (const row of front) {
    const w = row.length;
    for (let x = 0; x < Math.floor(w / 2); x++) {
      const mx = w - 1 - x;
      const a = row[x] ?? null;
      const b = row[mx] ?? null;
      if (a === null && b !== null) row[x] = b;
      else if (b === null && a !== null) row[mx] = a;
    }
  }
}

/** Fills pinholes and drops orphan cells so the silhouette stays clean. */
function cleanupFront(front: FrontMap): void {
  const h = front.length;
  const w = front[0]?.length ?? 0;
  const cellAt = (x: number, y: number): number | null => {
    if (y < 0 || y >= h || x < 0 || x >= w) return null;
    return front[y]?.[x] ?? null;
  };
  for (let y = 0; y < h; y++) {
    const row = front[y];
    if (!row) continue;
    for (let x = 0; x < w; x++) {
      const filled: number[] = [];
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (dx === 0 && dy === 0) continue;
          const c = cellAt(x + dx, y + dy);
          if (c !== null) filled.push(c);
        }
      }
      if (row[x] == null && filled.length >= 7) {
        // Pinhole: adopt the most common neighbor color.
        const votes = new Map<number, number>();
        for (const c of filled) votes.set(c, (votes.get(c) ?? 0) + 1);
        let best: number | null = null;
        let bestVotes = 0;
        for (const [color, count] of votes) {
          if (count > bestVotes) {
            bestVotes = count;
            best = color;
          }
        }
        row[x] = best;
      } else if (row[x] != null && filled.length <= 1) {
        row[x] = null; // orphan speck
      }
    }
  }
}
