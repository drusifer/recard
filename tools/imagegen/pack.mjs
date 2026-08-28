/**
 * imagegen — pack generated masters into web-sized assets.
 *
 * Generators return big files (1024x1536 from codex, ~1.7 MB each).
 * Shipping those verbatim is rarely right: 132 of them would add ~230 MB
 * to a repo for images that render a couple of hundred pixels wide. So
 * masters stay wherever they were generated (ideally a gitignored dir)
 * and only the packed copies are committed.
 *
 * ASPECT RATIO IS PRESERVED. Forcing a square was a real bug here —
 * backends return varied shapes (1024x1536, 1122x1402, 1200x800) and
 * squashing them all visibly distorted the non-square ones. Consumers
 * should crop with `object-fit: cover` rather than have the packer lie
 * about the image's proportions.
 */
import { readdir, mkdir } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import path from 'node:path';

const PY = `
import sys
from PIL import Image
src, dst, size, quality, fmt = sys.argv[1], sys.argv[2], int(sys.argv[3]), int(sys.argv[4]), sys.argv[5]
im = Image.open(src).convert('RGB')
im.thumbnail((size, size), Image.LANCZOS)   # preserves aspect ratio
im.save(dst, fmt.upper(), quality=quality, method=6) if fmt == 'webp' else im.save(dst, fmt.upper(), quality=quality)
`;

const SOURCE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.webp']);

function convert(source, destination, size, quality, format) {
  return new Promise((resolve) => {
    // eslint-disable-next-line sonarjs/no-os-command-from-path
    const child = spawn('python3', ['-c', PY, source, destination, String(size), String(quality), format], { stdio: 'ignore' });
    child.on('error', () => resolve(false));
    child.on('close', (code) => resolve(code === 0));
  });
}

/**
 * @param {{inDir: string, outDir: string, size: number, quality: number,
 *   format: string}} options
 */
export async function packAll({ inDir: inputDirectory, outDir: outputDirectory, size, quality, format }) {
  await mkdir(outputDirectory, { recursive: true });

  const entries = await readdir(inputDirectory);
  const sources = entries.filter((name) => SOURCE_EXTENSIONS.has(path.extname(name).toLowerCase()));

  let packed = 0;
  for (const name of sources) {
    const id = path.basename(name, path.extname(name));
    // Sequential on purpose: packing one image at a time stays gentle
    // on a small host.
    const ok = await convert(path.join(inputDirectory, name), path.join(outputDirectory, `${id}.${format}`), size, quality, format);
    if (ok) packed += 1;
    else console.error(`  ✖ ${id}`);
  }
  return { packed, total: sources.length, size, quality, format };
}
