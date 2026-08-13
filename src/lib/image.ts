// 인증샷을 localStorage에 안전하게 저장할 수 있도록 업로드 즉시 리사이즈 + 압축한다.
// 원본 사진(수 MB)을 그대로 base64로 저장하면 localStorage 용량 제한(보통 5~10MB)을
// 금방 넘겨서 앱이 통째로 죽는(흰 화면) 문제가 생기기 때문.
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
          // 캔버스를 못 쓰면 원본이라도 반환 (드문 경우)
          resolve(reader.result as string)
          return
        }
        ctx.drawImage(img, 0, 0, width, height)
        resolve(canvas.toDataURL('image/jpeg', quality))
      }
      img.src = reader.result as string
    }
    reader.readAsDataURL(file)
  })
}
