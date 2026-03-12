'use client';

import Image from 'next/image';
import { motion } from 'framer-motion';

/**
 * Persistent hero logo with premium continuous effects.
 * Always visible — no `visible` prop.
 */
export function IntroLogo() {
  return (
    <motion.div
      className="relative flex items-center justify-center"
      initial={{ opacity: 0, scale: 0.85, y: 24 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      transition={{ duration: 1.4, ease: [0.16, 1, 0.3, 1] }}
    >
      {/* Soft pulsing orange glow */}
      <motion.div
        className="absolute rounded-full -z-10"
        style={{
          width: '30rem',
          height: '30rem',
          background:
            'radial-gradient(circle, rgba(254,92,43,0.15) 0%, rgba(254,92,43,0.03) 50%, transparent 70%)',
          filter: 'blur(60px)',
        }}
        animate={{ scale: [1, 1.08, 1], opacity: [0.7, 1, 0.7] }}
        transition={{ duration: 4.5, repeat: Infinity, ease: 'easeInOut' }}
      />

      {/* Breathing scale + subtle vertical drift */}
      <motion.div
        className="relative"
        animate={{ scale: [1, 1.02, 1], y: [0, -2, 0] }}
        transition={{ duration: 5, repeat: Infinity, ease: 'easeInOut' }}
      >
        {/* Light sweep overlay */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none z-10 rounded-lg">
          <motion.div
            className="absolute inset-y-0 w-[30%]"
            style={{
              background:
                'linear-gradient(90deg, transparent, rgba(255,255,255,0.09) 50%, transparent)',
            }}
            animate={{ x: ['-120%', '450%'] }}
            transition={{
              duration: 2.2,
              repeat: Infinity,
              repeatDelay: 5.5,
              ease: [0.4, 0, 0.2, 1],
            }}
          />
        </div>

        <Image
          src="/intro/logo.png"
          alt="Intermidia"
          width={300}
          height={100}
          priority
          className="object-contain"
          style={{
            filter:
              'drop-shadow(0 0 45px rgba(254,92,43,0.18)) contrast(1.05)',
          }}
        />
      </motion.div>
    </motion.div>
  );
}
