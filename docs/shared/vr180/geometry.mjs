/** Fixed-front equirectangular crop and stereo packing; all coordinates are pixels. */
export function buildStereoGeometry({ width, height, layout, fov, eyeSize, outputEyeWidth, outputEyeHeight } = {}) {
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

  const flexible = outputEyeWidth !== undefined || outputEyeHeight !== undefined;
  const dw = flexible ? outputEyeWidth : eyeSize;
  const dh = flexible ? outputEyeHeight : eyeSize;
  if (flexible) {
    if (![dw, dh].every(n => Number.isSafeInteger(n) && n > 0 && n % 2 === 0)) throw new RangeError('EXPERIMENT_OUTPUT_DIMENSIONS');
    if (dw > cropWidth || dh > eyeHeight) throw new RangeError('EXPERIMENT_UPSCALE');
    if (dw * eyeHeight !== dh * cropWidth) throw new RangeError('EXPERIMENT_NONUNIFORM_SCALE');
  }
  return {
    width: dw * 2,
    height: dh,
    eyes: [0, 1].map(eye => ({
      sx: cropLeft + (layout === 'sbs' ? eye * eyeWidth : 0),
      sy: layout === 'tb' ? eye * eyeHeight : 0,
      sw: cropWidth,
      sh: eyeHeight,
      dx: eye * dw,
      dy: 0,
      dw,
      dh,
    })),
  };
}
