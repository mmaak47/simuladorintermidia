'use client';

import { motion } from 'framer-motion';

interface Props {
  visible: boolean;
  children: React.ReactNode;
}

/**
 * Generic fade-in/out wrapper for intro content.
 * Visibility is controlled externally by the timeline.
 */
export function IntroSlide({ visible, children }: Props) {
  return (
    <motion.div
      className="absolute inset-0 flex items-center justify-center px-8"
      animate={{ opacity: visible ? 1 : 0 }}
      transition={{ duration: 0.8, ease: [0.4, 0, 0.2, 1] }}
      style={{ pointerEvents: visible ? 'auto' : 'none' }}
    >
      {children}
    </motion.div>
  );
}
