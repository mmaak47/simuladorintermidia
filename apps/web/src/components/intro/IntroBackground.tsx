'use client';

import { useState, useEffect } from 'react';

const BG_IMAGES = ['/intro/bg1.jpg', '/intro/bg2.jpg', '/intro/bg3.jpg', '/intro/bg4.jpg'];

/**
 * Blurred cinematic background slideshow.
 * Changes image every 4s with a CSS crossfade.
 * Pure visual — no timeline logic.
 */
export function IntroBackground() {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    // Preload all images
    BG_IMAGES.forEach((src) => {
      const img = new window.Image();
      img.src = src;
    });

    const id = setInterval(() => {
      setIndex((i) => (i + 1) % BG_IMAGES.length);
    }, 4000);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="absolute inset-0 overflow-hidden" aria-hidden="true">
      {BG_IMAGES.map((src, i) => (
        <div
          key={src}
          className="absolute inset-[-8%] transition-opacity duration-[2500ms] ease-in-out bg-cover bg-center"
          style={{
            backgroundImage: `url(${src})`,
            filter: 'blur(44px) brightness(0.2) saturate(0.5)',
            opacity: i === index ? 1 : 0,
            transform: 'scale(1.1)',
          }}
        />
      ))}

      {/* Dark gradient overlay */}
      <div className="absolute inset-0 bg-gradient-to-b from-black/70 via-black/50 to-black/80" />

      {/* Vignette */}
      <div
        className="absolute inset-0"
        style={{
          background: 'radial-gradient(ellipse at center, transparent 30%, rgba(0,0,0,0.7) 100%)',
        }}
      />

      {/* Subtle orange glow */}
      <div
        className="absolute inset-0 opacity-[0.04]"
        style={{
          background: 'radial-gradient(ellipse 40% 35% at 50% 48%, #FE5C2B 0%, transparent 100%)',
        }}
      />

      {/* Film grain */}
      <div
        className="absolute inset-0 opacity-[0.03] mix-blend-overlay pointer-events-none"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.82' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`,
          backgroundSize: '128px 128px',
        }}
      />
    </div>
  );
}
