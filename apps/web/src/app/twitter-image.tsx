import { ImageResponse } from 'next/og'
import { readFileSync } from 'fs'
import { join } from 'path'

export const runtime = 'nodejs'

export const size = {
  width: 1200,
  height: 600,
}

export const contentType = 'image/png'

export default async function Image() {
  try {
    // Fetch icon from public directory
    const iconData = readFileSync(join(process.cwd(), 'public', 'icon-512x512.png'))
    const iconBase64 = iconData.toString('base64')

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
            gap: '20px',
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
              fontSize: '56px',
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
              fontSize: '22px',
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
    console.error('Error generating Twitter image:', error)
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
