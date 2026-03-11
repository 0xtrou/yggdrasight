import { ImageResponse } from 'next/og'

export const runtime = 'nodejs'

export const size = {
  width: 1200,
  height: 630,
}

export const contentType = 'image/png'

export default async function Image() {
  try {
    // Fetch icon from public directory
    const iconPath = new URL('../../public/icon-512x512.png', import.meta.url)
    const iconData = await fetch(iconPath).then((res) => res.arrayBuffer())
    const iconBase64 = Buffer.from(iconData).toString('base64')

    return new ImageResponse(
      (
        <div
          style={{
            width: '100%',
            height: '100%',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: '#000000',
            fontFamily: 'monospace',
            gap: '24px',
          }}
        >
          {/* Icon Container */}
          <div
            style={{
              width: '120px',
              height: '120px',
              borderRadius: '16px',
              backgroundColor: '#1a1a1a',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              border: '1px solid #333333',
            }}
          >
            <img
              src={`data:image/png;base64,${iconBase64}`}
              alt="Yggdrasight"
              style={{
                width: '100px',
                height: '100px',
              }}
            />
          </div>

          {/* Main Title */}
          <div
            style={{
              fontSize: '60px',
              fontWeight: 'bold',
              color: '#ffffff',
              letterSpacing: '0.15em',
              textAlign: 'center',
              margin: '0',
              fontFamily: 'monospace',
            }}
          >
            YGGDRASIGHT
          </div>

          {/* Subtitle */}
          <div
            style={{
              fontSize: '24px',
              color: '#888888',
              textAlign: 'center',
              margin: '0',
              fontFamily: 'monospace',
            }}
          >
            AI-Powered Trading Intelligence Terminal
          </div>
        </div>
      ),
      {
        ...size,
      }
    )
  } catch (error) {
    console.error('Error generating OG image:', error)
    return new ImageResponse(
      (
        <div
          style={{
            width: '100%',
            height: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: '#000000',
            color: '#ffffff',
            fontSize: '48px',
            fontFamily: 'monospace',
          }}
        >
          YGGDRASIGHT
        </div>
      ),
      {
        ...size,
      }
    )
  }
}
