"use client";
import { useEffect, useState } from 'react';
import QRCode from 'qrcode';

/** Renders a QR code for `value` as inline SVG (crisp at any size). */
export default function QrCode({
  value,
  size = 160,
  className,
}: {
  value: string;
  size?: number;
  className?: string;
}) {
  const [svg, setSvg] = useState<string>('');

  useEffect(() => {
    let cancelled = false;
    QRCode.toString(value, {
      type: 'svg',
      margin: 1,
      width: size,
      color: { dark: '#2a1a12', light: '#ffffff' },
      errorCorrectionLevel: 'M',
    })
      .then((s) => { if (!cancelled) setSvg(s); })
      .catch(() => { if (!cancelled) setSvg(''); });
    return () => { cancelled = true; };
  }, [value, size]);

  return (
    <div
      className={className}
      style={{ width: size, height: size }}
      // qrcode returns a standalone <svg> string
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}
