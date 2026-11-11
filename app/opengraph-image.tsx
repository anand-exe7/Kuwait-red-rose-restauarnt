import { ImageResponse } from 'next/og';

// Dynamic Open Graph / Twitter card image, generated at the edge with next/og.
// Placed at the app root so every indexable page (home, menu) gets a branded
// 1200×630 share card without shipping a static asset. Typographic by design:
// no font fetch, no remote image load — so it can never fail to render.
export const alt = 'Red Rose Sweets — Baklava & Arabic Pastry in Al Qurain, Kuwait';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default function OpengraphImage() {
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
          backgroundColor: '#fbf8ee',
          fontFamily: 'sans-serif',
          position: 'relative',
        }}
      >
        <div
          style={{
            position: 'absolute',
            top: 28,
            left: 28,
            right: 28,
            bottom: 28,
            border: '2px solid #c9a961',
            borderRadius: 28,
            display: 'flex',
          }}
        />
        <div
          style={{
            display: 'flex',
            fontSize: 26,
            letterSpacing: 10,
            color: '#b01e28',
            fontWeight: 700,
            marginBottom: 28,
          }}
        >
          AL QURAIN · KUWAIT
        </div>
        <div
          style={{
            display: 'flex',
            fontSize: 108,
            color: '#2a1a12',
            fontWeight: 800,
            lineHeight: 1,
          }}
        >
          Red Rose Sweets
        </div>
        <div
          style={{
            display: 'flex',
            width: 130,
            height: 6,
            backgroundColor: '#b01e28',
            borderRadius: 3,
            marginTop: 38,
            marginBottom: 38,
          }}
        />
        <div
          style={{
            display: 'flex',
            justifyContent: 'center',
            fontSize: 36,
            color: '#6b5340',
          }}
        >
          Baklava · Maamoul · Arabic &amp; French Pastry
        </div>
      </div>
    ),
    { ...size },
  );
}
