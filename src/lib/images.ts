// Receipt photos are stored inside Firestore documents (free Spark plan, no
// Cloud Storage), so each must fit under the 1 MiB document limit. We resize
// and re-encode as JPEG, stepping quality/size down until the base64 data URL
// is under budget.

const MAX_DATA_URL_CHARS = 900_000
const ATTEMPTS: Array<[maxSide: number, quality: number]> = [
  [1800, 0.8],
  [1600, 0.7],
  [1400, 0.65],
  [1200, 0.6],
  [1000, 0.55],
  [800, 0.5],
]

export interface CompressedImage {
  dataUrl: string
  width: number
  height: number
  bytes: number
}

async function loadImage(file: Blob): Promise<HTMLImageElement> {
  const url = URL.createObjectURL(file)
  try {
    const img = new Image()
    img.src = url
    await img.decode()
    return img
  } finally {
    URL.revokeObjectURL(url)
  }
}

export async function compressImage(file: Blob): Promise<CompressedImage> {
  if (!file.type.startsWith('image/')) {
    throw new Error('Only photos and screenshots can be attached (not PDFs).')
  }
  const img = await loadImage(file)
  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Your browser cannot process images')

  for (const [maxSide, quality] of ATTEMPTS) {
    const scale = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight))
    canvas.width = Math.round(img.naturalWidth * scale)
    canvas.height = Math.round(img.naturalHeight * scale)
    // White background so transparent screenshots don't turn black as JPEG.
    ctx.fillStyle = '#fff'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
    const dataUrl = canvas.toDataURL('image/jpeg', quality)
    if (dataUrl.length <= MAX_DATA_URL_CHARS) {
      return {
        dataUrl,
        width: canvas.width,
        height: canvas.height,
        bytes: Math.round((dataUrl.length - 'data:image/jpeg;base64,'.length) * 0.75),
      }
    }
  }
  throw new Error('That image is too large even after compression')
}
