import { useEffect, useState } from 'react'
import { avatarColorFor, avatarUrlFor, initialsOf } from '../lib/avatar'

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
  const [imageFailed, setImageFailed] = useState(false)

  useEffect(() => setImageFailed(false), [safeSrc])

  if (safeSrc && !imageFailed) {
    return <img className={className} src={safeSrc} alt={name} title={title} style={style} onError={() => setImageFailed(true)} />
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
