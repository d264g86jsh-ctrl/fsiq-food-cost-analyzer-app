import type { Metadata } from "next";
import { Inter } from "next/font/google";
import Script from "next/script";
import "./globals.css";

const inter = Inter({ subsets: ["latin"] });

const META_PIXEL_ID = '1679245649839076';

export const metadata: Metadata = {
  title: "FSIQ Food Cost Analyzer",
  description: "FoodServiceIQ Food Cost Analyzer",
  icons: {
    icon: [
      { url: '/icon.svg', type: 'image/svg+xml' },
      { url: '/brand/fsiq-iq-logo.png', type: 'image/png', sizes: '320x320' },
    ],
    apple: '/brand/fsiq-iq-logo.png',
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className={inter.className}>
        {children}

        {/* Meta Pixel — PageView fires on every page load */}
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
fbq('init','${META_PIXEL_ID}');
fbq('track','PageView');
            `.trim(),
          }}
        />

        {/* Tracking — captures UTM params and fbp/fbc cookies into sessionStorage
            on page load so the React form can read them without a network round-trip */}
        <Script
          id="fsiq-tracking"
          strategy="afterInteractive"
          dangerouslySetInnerHTML={{
            __html: `
(function(){
  try {
    var p = new URLSearchParams(window.location.search);
    var keys = ['utm_source','utm_medium','utm_campaign','utm_content','utm_term','utm_id',
                'fbclid','gclid','fbadid','creative_name','creative_id','campaign'];
    keys.forEach(function(k){ var v = p.get(k); if(v) sessionStorage.setItem('fsiq_'+k, v); });

    function getCookie(name){
      var m = document.cookie.match('(^|;)\\\\s*'+name+'\\\\s*=\\\\s*([^;]+)');
      return m ? m.pop() : '';
    }
    var fbp = getCookie('_fbp');
    var fbc = getCookie('_fbc');
    if(!fbc && p.get('fbclid')) fbc = 'fb.1.'+Date.now()+'.'+p.get('fbclid');
    if(fbp) sessionStorage.setItem('fsiq_fbp', fbp);
    if(fbc) sessionStorage.setItem('fsiq_fbc', fbc);

    if(p.get('fbclid')) sessionStorage.setItem('fsiq_landing_page_url', window.location.href);
    if(!sessionStorage.getItem('fsiq_referrer') && document.referrer)
      sessionStorage.setItem('fsiq_referrer', document.referrer);
  } catch(e){}
})();
            `.trim(),
          }}
        />
      </body>
    </html>
  );
}
