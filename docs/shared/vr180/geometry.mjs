/** Fixed-front equirectangular crop and stereo packing; all coordinates are pixels. */
export function buildStereoGeometry({ width, height, layout, fov, eyeSize } = {}) {
  if (![width, height, eyeSize].every(value => Number.isSafeInteger(value) && value > 0)) {
    throw new TypeError('Frame dimensions and eyeSize must be positive integers.');
  }
  if (layout !== 'sbs' && layout !== 'tb') throw new TypeError('layout must be sbs or tb.');
  if (fov !== 180 && fov !== 360) throw new TypeError('Per-eye fov must be 180 or 360 degrees.');
  if ((layout === 'sbs' ? width : height) % 2 !== 0) {
    throw new RangeError('The packed dimension must divide into two complete eye images.');
  }
  if (eyeSize % 2 !== 0) throw new RangeError('eyeSize must be even for the H.264 output profile.');

  const eyeWidth = layout === 'sbs' ? width / 2 : width;
  const eyeHeight = layout === 'tb' ? height / 2 : height;
  const cropWidth = fov === 360 ? eyeWidth / 2 : eyeWidth;
  const cropLeft = fov === 360 ? eyeWidth / 4 : 0;
  if (eyeSize > Math.min(cropWidth, eyeHeight)) {
    throw new RangeError('b1 supports retaining or reducing resolution, not upscaling.');
  }

  return {
    width: eyeSize * 2,
    height: eyeSize,
    eyes: [0, 1].map(eye => ({
      sx: cropLeft + (layout === 'sbs' ? eye * eyeWidth : 0),
      sy: layout === 'tb' ? eye * eyeHeight : 0,
      sw: cropWidth,
      sh: eyeHeight,
      dx: eye * eyeSize,
      dy: 0,
      dw: eyeSize,
      dh: eyeSize,
    })),
  };
}
