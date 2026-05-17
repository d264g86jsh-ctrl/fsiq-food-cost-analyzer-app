'use client';

// Injects the Meta Pixel base code and fires PageView on mount.
// Uses Next.js Script with strategy="afterInteractive" so it does not block render.
// pixelId comes from NEXT_PUBLIC_META_PIXEL_ID — embedded at build time, not user input.

import Script from 'next/script';

interface MetaPixelProps {
  pixelId: string;
}

export function MetaPixel({ pixelId }: MetaPixelProps) {
  return (
    <Script
      id="meta-pixel-init"
      strategy="afterInteractive"
      dangerouslySetInnerHTML={{
        __html: `
!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?
n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;
n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;
t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}
(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');
fbq('init','${pixelId}');
fbq('track','PageView');
        `.trim(),
      }}
    />
  );
}
