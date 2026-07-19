import { hash, RECIPES, render, wav } from './generate.mjs';
import { loadManifest } from './validate.mjs';
const manifest = loadManifest(); let failures = 0;
for (const assets of Object.values(manifest.events)) for (const asset of assets) {
  const recipe = RECIPES[asset.recipeId]; const rendered = wav(render(recipe, asset.variantIndex), recipe.channels ?? 1);
  if (hash(rendered) !== asset.wav.sha256) { console.error(`reproducibility mismatch ${asset.recipeId} v${asset.variantIndex + 1}`); failures++; }
}
if (failures) process.exit(1);
console.log('audio reproducibility passed: every manifest WAV hash re-renders byte-for-byte');
