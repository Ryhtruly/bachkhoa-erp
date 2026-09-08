import { useEffect, useState } from 'react'
import { avatarColorFor, avatarUrlFor, initialsOf } from '../lib/avatar'
import { extractPrivateKey, fetchPrivateObjectBlob } from '../lib/privateStorage'

/** Render a safe avatar URL and degrade to deterministic initials on 404/load failure. */
export default function AvatarImage({
  src,
  name,
  className,
  fallbackClassName = className,
  style,
  fallbackStyle,
  title,
  fallback,
}) {
  const safeSrc = avatarUrlFor(src)
  const privateKey = extractPrivateKey(src)
  const [privateSrc, setPrivateSrc] = useState(null)
  const [imageFailed, setImageFailed] = useState(false)

  useEffect(() => {
    setImageFailed(false)
    setPrivateSrc(null)
    if (!privateKey) return undefined

    let cancelled = false
    let objectUrl = null
    fetchPrivateObjectBlob(privateKey)
      .then(blob => {
        if (cancelled) return
        objectUrl = URL.createObjectURL(blob)
        setPrivateSrc(objectUrl)
      })
      .catch(() => {
        if (!cancelled) setImageFailed(true)
      })

    return () => {
      cancelled = true
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [privateKey, safeSrc])

  const resolvedSrc = privateKey ? privateSrc : safeSrc

  if (resolvedSrc && !imageFailed) {
    return <img className={className} src={resolvedSrc} alt={name} title={title} style={style} onError={() => setImageFailed(true)} />
  }

  if (fallback) return fallback

  return (
    <span
      className={fallbackClassName}
      style={{ ...style, ...fallbackStyle, background: fallbackStyle?.background || avatarColorFor(name) }}
      title={title || `${name} chưa có ảnh đại diện`}
      aria-label={`Ảnh đại diện dự phòng của ${name}`}
    >
      {initialsOf(name)}
    </span>
  )
}
