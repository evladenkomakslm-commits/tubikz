'use client';
import Link from 'next/link';
import { motion } from 'framer-motion';

export function WelcomeHero() {
  return (
    <section className="flex-1 flex flex-col items-center justify-center px-6 text-center">
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
        className="mb-8 float"
      >
        <div className="relative inline-flex items-center justify-center">
          <div className="absolute inset-0 blur-3xl bg-accent/40 rounded-full" />
          <div className="relative w-24 h-24 rounded-3xl bg-gradient-to-br from-accent to-fuchsia-500 flex items-center justify-center text-5xl font-bold shadow-2xl shadow-accent/30">
            ₮
          </div>
        </div>
      </motion.div>

      <motion.h1
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.7, delay: 0.15, ease: [0.16, 1, 0.3, 1] }}
        className="text-4xl sm:text-6xl md:text-7xl font-semibold tracking-tight bg-gradient-to-b from-white to-text-muted bg-clip-text text-transparent"
      >
        тюбики собираются здесь
      </motion.h1>

      <motion.p
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.7, delay: 0.3 }}
        className="mt-5 max-w-xl text-text-muted text-base sm:text-lg"
      >
        мессенджер, в котором атмосфера важнее уведомлений.
        пиши, звони, оставляй голосовые — без шума.
      </motion.p>

      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.7, delay: 0.45 }}
        className="mt-10 flex flex-col sm:flex-row gap-3"
      >
        <Link href="/register" className="tk-btn-primary px-6">
          стать тюбиком
        </Link>
        <Link href="/login" className="tk-btn-ghost px-6">
          у меня уже есть аккаунт
        </Link>
      </motion.div>

      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 1, delay: 0.8 }}
        className="mt-16 grid grid-cols-3 gap-3 max-w-md w-full"
      >
        {[
          { t: 'real-time', d: 'мгновенно' },
          { t: 'voice', d: 'голосовые' },
          { t: 'media', d: 'фото · видео' },
        ].map((f) => (
          <div
            key={f.t}
            className="rounded-2xl border border-border bg-bg-panel/60 backdrop-blur p-4"
          >
            <div className="text-text font-medium text-sm">{f.t}</div>
            <div className="text-text-subtle text-xs mt-1">{f.d}</div>
          </div>
        ))}
      </motion.div>
    </section>
  );
}
