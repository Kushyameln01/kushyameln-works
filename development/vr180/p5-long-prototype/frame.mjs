// Private long trial: calibrated pixel formula; only 30 fps and frame bounds differ.
// The 16-bit visual marker wraps; absolute order is verified with all PTS/frames.
export const LONG_FRAME_PROFILE = Object.freeze({eyeSize: 512, width: 1024, height: 512,
  rgbaBytes: 1024 * 512 * 4, seed: 0x1802026, maxFrames: 100000});

export function fillLongFrame(bytes, frameId, {fps = 30, seed = LONG_FRAME_PROFILE.seed} = {}) {
  if (!(bytes instanceof Uint8ClampedArray) || bytes.length !== LONG_FRAME_PROFILE.rgbaBytes
    || !Number.isSafeInteger(frameId) || frameId < 0 || frameId >= LONG_FRAME_PROFILE.maxFrames
    || fps !== 30 || !Number.isInteger(seed)) throw Error('CALIBRATION_LONG_FRAME_PROFILE_INVALID');
  const n = LONG_FRAME_PROFILE.eyeSize, width = LONG_FRAME_PROFILE.width;
  const eventAt = frameId % (fps * 10), event = eventAt >= fps - 1 && eventAt <= fps + 1;
  function pixel(x, y, r, g = r, b = r) {
    const at = 4 * (y * width + x); bytes[at] = r; bytes[at + 1] = g; bytes[at + 2] = b; bytes[at + 3] = 255;
  }
  function rectangle(x, y, w, h, r, g = r, b = r) {
    for (let iy = y; iy < y + h; iy++) for (let ix = x; ix < x + w; ix++) pixel(ix, iy, r, g, b);
  }
  for (let eye = 0; eye < 2; eye++) {
    let state = (seed ^ Math.imul(frameId + 1, 0x9e3779b9) ^ Math.imul(eye + 1, 0x85ebca6b)) >>> 0;
    if (!state) state = 1;
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
      state ^= state << 13; state ^= state >>> 17; state ^= state << 5;
      pixel(eye * n + x, y, state >>> 24);
    }
    const x = eye * n;
    rectangle(x + 8, 8, 40, 56, 0);
    rectangle(x + 12, 12, 8, 40, 255); rectangle(x + 12, 44, 28, 8, 255);
    if (eye) { rectangle(x + 32, 12, 8, 40, 255); rectangle(x + 12, 12, 28, 8, 255); }
    for (let bit = 0; bit < 16; bit++) rectangle(x + 64 + bit * 12, 12, 8, 16, (frameId >>> bit & 1) ? 255 : 0);
    if (event) rectangle(x + 232, 200, 48, 56, 255, 0, 0);
  }
  return {frameId, timestamp: frameId / fps, duration: 1 / fps, redEvent: event, bytes: bytes.length};
}
