/**
 * Cloudinary Upload Helper
 * Hỗ trợ upload ảnh trực tiếp lên Cloudinary bằng unsigned upload preset hoặc fallback base64
 */

export const getCloudinaryConfig = () => {
  const cloudName =
    localStorage.getItem('speego_cloudinary_cloud_name') ||
    import.meta.env.VITE_CLOUDINARY_CLOUD_NAME ||
    'ksny3wwy'

  const uploadPreset =
    localStorage.getItem('speego_cloudinary_upload_preset') ||
    import.meta.env.VITE_CLOUDINARY_UPLOAD_PRESET ||
    'nr5kwa0r'

  return { cloudName, uploadPreset }
}

export const saveCloudinaryConfig = (cloudName, uploadPreset) => {
  if (cloudName) localStorage.setItem('speego_cloudinary_cloud_name', cloudName.trim())
  if (uploadPreset) localStorage.setItem('speego_cloudinary_upload_preset', uploadPreset.trim())
}

export const uploadToCloudinary = async (imageFileOrBase64) => {
  const { cloudName, uploadPreset } = getCloudinaryConfig()

  try {
    const formData = new FormData()
    formData.append('file', imageFileOrBase64)
    formData.append('upload_preset', uploadPreset)

    const response = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/image/upload`, {
      method: 'POST',
      body: formData
    })

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      console.warn('Cloudinary upload warning:', errorData?.error?.message || response.statusText)
      // Nếu Cloudinary chưa được cấu hình preset trên cloud, trả về trực tiếp base64 để không làm gián đoạn việc chấm công
      if (typeof imageFileOrBase64 === 'string') return imageFileOrBase64
      return URL.createObjectURL(imageFileOrBase64)
    }

    const data = await response.json()
    return data.secure_url || data.url
  } catch (error) {
    console.warn('Lỗi kết nối Cloudinary, sử dụng ảnh nội bộ:', error.message)
    if (typeof imageFileOrBase64 === 'string') return imageFileOrBase64
    return URL.createObjectURL(imageFileOrBase64)
  }
}
