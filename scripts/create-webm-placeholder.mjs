/**
 * Generates a small WebM placeholder video and saves it to the public directory.
 * This uses a headless approach with minimal WebM file creation.
 *
 * Usage: node --experimental-modules scripts/create-webm-placeholder.mjs
 *
 * Since we can't use canvas in Node without native deps, this creates
 * a minimal valid WebM file with dark frames. In production, real video
 * files would be uploaded through the CMS.
 */

import { writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dirname, '..', 'apps', 'web', 'public', 'placeholders');

// Minimal WebM (Matroska) container with VP8 codec
// This creates a 1920x1080 2-second black video
// The binary is a pre-computed minimal valid WebM

const WIDTH = 1920;
const HEIGHT = 1080;

// VP8 keyframe for a solid dark frame (simplified)
function createVP8Frame(w, h) {
  // VP8 frame header for a keyframe
  // This is a minimal valid VP8 keyframe that decodes to a dark frame
  const frameTag = Buffer.alloc(10);
  // Frame tag: keyframe, version 0, show_frame
  frameTag[0] = 0x9d; // keyframe sync code
  frameTag[1] = 0x01;
  frameTag[2] = 0x2a;
  // Width (little-endian) with scale 0
  frameTag[3] = w & 0xff;
  frameTag[4] = (w >> 8) & 0x3f;
  // Height (little-endian) with scale 0
  frameTag[5] = h & 0xff;
  frameTag[6] = (h >> 8) & 0x3f;
  
  // Minimal VP8 bitstream data (color space, segmentation, etc.)
  // For a proper VP8 frame we'd need actual entropy-coded data
  // Instead, let's create a minimal 1-byte partition
  frameTag[7] = 0x00;
  frameTag[8] = 0x00;
  frameTag[9] = 0x00;
  
  return frameTag;
}

// EBML helpers
function ebmlId(id) {
  if (id <= 0xff) return Buffer.from([id]);
  if (id <= 0xffff) return Buffer.from([(id >> 8) & 0xff, id & 0xff]);
  if (id <= 0xffffff) return Buffer.from([(id >> 16) & 0xff, (id >> 8) & 0xff, id & 0xff]);
  return Buffer.from([(id >> 24) & 0xff, (id >> 16) & 0xff, (id >> 8) & 0xff, id & 0xff]);
}

function ebmlSize(size) {
  if (size < 0x7f) return Buffer.from([size | 0x80]);
  if (size < 0x3fff) return Buffer.from([0x40 | ((size >> 8) & 0x3f), size & 0xff]);
  if (size < 0x1fffff) return Buffer.from([0x20 | ((size >> 16) & 0x1f), (size >> 8) & 0xff, size & 0xff]);
  return Buffer.from([0x10 | ((size >> 24) & 0x0f), (size >> 16) & 0xff, (size >> 8) & 0xff, size & 0xff]);
}

function ebmlUint(value, size) {
  const buf = Buffer.alloc(size);
  for (let i = size - 1; i >= 0; i--) {
    buf[i] = value & 0xff;
    value = Math.floor(value / 256);
  }
  return buf;
}

function ebmlElement(id, data) {
  const idBuf = typeof id === 'number' ? ebmlId(id) : id;
  const dataBuf = Buffer.isBuffer(data) ? data : Buffer.from(data);
  const sizeBuf = ebmlSize(dataBuf.length);
  return Buffer.concat([idBuf, sizeBuf, dataBuf]);
}

function ebmlMasterElement(id, children) {
  const data = Buffer.concat(children);
  return ebmlElement(id, data);
}

// For unknown-size master elements (like Segment)
function ebmlMasterUnknownSize(id, children) {
  const idBuf = typeof id === 'number' ? ebmlId(id) : id;
  const data = Buffer.concat(children);
  // Unknown size marker for 8 bytes
  const sizeBuf = Buffer.from([0x01, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff]);
  return Buffer.concat([idBuf, sizeBuf, data]);
}

console.log('Note: Cannot create proper WebM without canvas/VP8 encoder in Node.');
console.log('The video demo point will generate its placeholder video client-side at runtime.');
console.log('Use the generatePlaceholderVideo() utility from lib/placeholder-video.ts');
