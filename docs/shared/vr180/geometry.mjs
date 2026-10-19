/** Fixed-front equirectangular crop and stereo packing; all coordinates are pixels.
 * preserve uses one exact scale for both axes of both eyes; no aspect rounding.
 */
export function buildStereoGeometry({ width, height, layout, fov, eyeSize,
  outputEyeWidth, outputEyeHeight, outputShape = 'square', outputScale = 1 } = {}) {
  if (![width, height].every(value => Number.isSafeInteger(value) && value > 0)) {
    throw new TypeError('Frame dimensions must be positive integers.');
  }
  if (layout !== 'sbs' && layout !== 'tb') throw new TypeError('layout must be sbs or tb.');
  if (fov !== 180 && fov !== 360) throw new TypeError('Per-eye fov must be 180 or 360 degrees.');
  if ((layout === 'sbs' ? width : height) % 2 !== 0) throw new RangeError('The packed dimension must divide into two complete eye images.');
  if (!['square', 'preserve'].includes(outputShape)) throw new RangeError('OUTPUT_SHAPE_UNSUPPORTED');
  const eyeWidth = layout === 'sbs' ? width / 2 : width;
  const eyeHeight = layout === 'tb' ? height / 2 : height;
  const cropWidth = fov === 360 ? eyeWidth / 2 : eyeWidth;
  const cropLeft = fov === 360 ? eyeWidth / 4 : 0;
  const explicit = outputEyeWidth !== undefined || outputEyeHeight !== undefined;
  if (outputShape === 'preserve' && explicit) throw new RangeError('OUTPUT_DIMENSIONS_CONFLICT');
  if (outputShape === 'preserve' && ![1, 0.5, 0.25].includes(outputScale)) throw new RangeError('OUTPUT_SCALE_UNSUPPORTED');
  if (outputShape !== 'preserve' && outputScale !== 1) throw new RangeError('OUTPUT_SCALE_REQUIRES_PRESERVE');
  const flexible = explicit || outputShape === 'preserve';
  const dw = explicit ? outputEyeWidth : outputShape === 'preserve' ? cropWidth * outputScale : eyeSize;
  const dh = explicit ? outputEyeHeight : outputShape === 'preserve' ? eyeHeight * outputScale : eyeSize;
  if (![dw, dh].every(n => Number.isSafeInteger(n) && n > 0 && n % 2 === 0)
    || !Number.isSafeInteger(dw * 2)) throw new RangeError('OUTPUT_DIMENSIONS_EVEN_REQUIRED');
  if (dw > cropWidth || dh > eyeHeight) throw new RangeError('b1 supports retaining or reducing resolution, not upscaling.');
  if (flexible && BigInt(dw) * BigInt(eyeHeight) * 2n !== BigInt(dh) * BigInt(eyeWidth) * BigInt(fov === 360 ? 1 : 2)) {
    throw new RangeError('OUTPUT_NONUNIFORM_SCALE');
  }
  return {
    width: dw * 2, height: dh,
    eyes: [0, 1].map(eye => ({
      sx: cropLeft + (layout === 'sbs' ? eye * eyeWidth : 0), sy: layout === 'tb' ? eye * eyeHeight : 0,
      sw: cropWidth, sh: eyeHeight, dx: eye * dw, dy: 0, dw, dh,
    })),
  };
}
