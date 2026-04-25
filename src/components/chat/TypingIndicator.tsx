'use client';
import { motion } from 'framer-motion';

export function TypingIndicator() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      className="px-6 pb-2"
    >
      <div className="inline-flex items-center gap-1 bg-bg-panel border border-border rounded-full px-3 py-1.5">
        <span className="w-1.5 h-1.5 rounded-full bg-text-muted animate-typing" style={{ animationDelay: '0ms' }} />
        <span className="w-1.5 h-1.5 rounded-full bg-text-muted animate-typing" style={{ animationDelay: '150ms' }} />
        <span className="w-1.5 h-1.5 rounded-full bg-text-muted animate-typing" style={{ animationDelay: '300ms' }} />
      </div>
    </motion.div>
  );
}
