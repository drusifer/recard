/**
 * imagegen — image validation (thin wrapper over Pillow).
 *
 * Validates by DIMENSIONS, never by byte size. In a real run the two
 * smallest files (40 KB and 57 KB) turned out to be perfectly good art
 * that simply compressed well, so a size threshold would have thrown
 * away valid images. What actually distinguishes a real generated
 * painting from a failed or placeholder file is that it opens and is
 * reasonably large.
 *
 * Pillow rather than ImageMagick: `convert`/`cwebp` are not installed
 * on this host and Pillow is (checked, not assumed).
 */
import { spawn } from 'node:child_process';

const PY = `
import sys
from PIL import Image
try:
    im = Image.open(sys.argv[1]); im.load()
    sys.exit(0 if min(im.size) >= int(sys.argv[2]) else 1)
except Exception:
    sys.exit(1)
`;

/**
 * @param {string} file
 * @param {number} minSize smallest acceptable dimension, in pixels
 * @returns {Promise<boolean>}
 */
export function imageIsValid(file, minSize = 512) {
  return new Promise((resolve) => {
    // eslint-disable-next-line sonarjs/no-os-command-from-path
    const child = spawn('python3', ['-c', PY, file, String(minSize)], { stdio: 'ignore' });
    child.on('error', () => resolve(false));
    child.on('close', (code) => resolve(code === 0));
  });
}
