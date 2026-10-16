// Resize locally before upload; never send original camera images to Storage.
// Bound the actual encoded size, not just dimensions/quality.
export function compressImageFile(file: File, maxDimension = 640, quality = 0.7): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(reader.error ?? new Error('파일을 읽지 못했어요'))
    reader.onload = () => {
      const img = new Image()
      img.onerror = () => reject(new Error('이미지를 불러오지 못했어요'))
      img.onload = () => {
        let { width, height } = img
        if (width > maxDimension || height > maxDimension) {
          if (width >= height) {
            height = Math.round((height * maxDimension) / width)
            width = maxDimension
          } else {
            width = Math.round((width * maxDimension) / height)
            height = maxDimension
          }
        }
        const canvas = document.createElement('canvas')
        canvas.width = width
        canvas.height = height
        const ctx = canvas.getContext('2d')
        if (!ctx) {
          reject(new Error('사진을 처리하지 못했어요. 다시 시도해주세요.'))
          return
        }
        for (let attempt = 0; attempt < 6; attempt++) {
          canvas.width = Math.max(1, Math.round(width))
          canvas.height = Math.max(1, Math.round(height))
          ctx.fillStyle = '#ffffff'
          ctx.fillRect(0, 0, canvas.width, canvas.height)
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
          const encoded = canvas.toDataURL('image/jpeg', Math.max(0.4, quality - attempt * 0.06))
          const payload = encoded.slice(encoded.indexOf(',') + 1)
          if (encoded.startsWith('data:image/jpeg;base64,') && Math.ceil(payload.length * 3 / 4) <= 200 * 1024) {
            resolve(encoded)
            return
          }
          width *= 0.8; height *= 0.8
        }
        reject(new Error('사진은 200KB 이하로 압축해주세요.'))
      }
      img.src = reader.result as string
    }
    reader.readAsDataURL(file)
  })
}
