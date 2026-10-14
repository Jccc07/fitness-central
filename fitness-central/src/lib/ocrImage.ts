// Prepares a screenshot for OCR. Strava share templates are usually light text on a dark or
// patterned background, which Tesseract reads poorly, so we upscale, invert and threshold.
export async function prepareForOcr(file: File, variant: 'clean' | 'raw'): Promise<HTMLCanvasElement> {
  const bmp = await createImageBitmap(file)
  const scale = Math.max(1, Math.min(3, 1600 / Math.max(bmp.width, bmp.height)))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(bmp.width * scale)
  canvas.height = Math.round(bmp.height * scale)
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!
  ctx.drawImage(bmp, 0, 0, canvas.width, canvas.height)
  bmp.close()
  if (variant === 'raw') return canvas

  const img = ctx.getImageData(0, 0, canvas.width, canvas.height)
  const px = img.data
  let sum = 0
  const lum = new Float32Array(px.length / 4)
  for (let i = 0, j = 0; i < px.length; i += 4, j++) {
    lum[j] = 0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2]
    sum += lum[j]
  }
  const dark = sum / lum.length < 128
  for (let i = 0, j = 0; i < px.length; i += 4, j++) {
    let v = dark ? 255 - lum[j] : lum[j]
    if (dark) v = v > 90 ? 255 : 0 // text becomes solid black on white
    px[i] = px[i + 1] = px[i + 2] = v
    px[i + 3] = 255
  }
  ctx.putImageData(img, 0, 0)
  return canvas
}
