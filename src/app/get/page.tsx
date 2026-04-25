import Link from 'next/link';
import { Smartphone, Download, Apple } from 'lucide-react';

export const metadata = {
  title: '₮ubikz · скачать',
  description: 'установи ₮ubikz на свой телефон',
};

export default function GetPage() {
  return (
    <main className="min-h-screen mesh-bg flex flex-col">
      <header className="px-6 py-5">
        <Link href="/" className="inline-flex items-center gap-2 text-xl font-semibold">
          <span className="text-accent">₮</span>
          <span>ubikz</span>
        </Link>
      </header>

      <section className="flex-1 flex items-center justify-center px-6">
        <div className="max-w-2xl w-full animate-slide-up">
          <h1 className="text-4xl sm:text-5xl font-semibold tracking-tight bg-gradient-to-b from-white to-text-muted bg-clip-text text-transparent">
            тюбик в кармане
          </h1>
          <p className="mt-4 text-text-muted text-base sm:text-lg max-w-xl">
            установи ₮ubikz прямо на телефон. та же учётка, та же история, теперь — нативно.
          </p>

          <div className="mt-10 grid sm:grid-cols-2 gap-4">
            <a
              href="/downloads/tubikz.apk"
              download="tubikz.apk"
              className="group rounded-2xl border border-border bg-bg-panel/70 backdrop-blur p-6 hover:bg-bg-elevated transition-all"
            >
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 rounded-xl bg-success/15 flex items-center justify-center">
                  <Smartphone className="w-5 h-5 text-success" />
                </div>
                <div>
                  <div className="font-medium">Android</div>
                  <div className="text-xs text-text-muted">5.2 MB · debug</div>
                </div>
              </div>
              <div className="flex items-center gap-2 text-accent group-hover:gap-3 transition-all">
                <Download className="w-4 h-4" />
                <span className="text-sm font-medium">скачать APK</span>
              </div>
            </a>

            <div className="rounded-2xl border border-border bg-bg-panel/70 backdrop-blur p-6 opacity-60">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 rounded-xl bg-text-muted/15 flex items-center justify-center">
                  <Apple className="w-5 h-5 text-text-muted" />
                </div>
                <div>
                  <div className="font-medium">iOS</div>
                  <div className="text-xs text-text-muted">PWA · скоро native</div>
                </div>
              </div>
              <div className="text-sm text-text-muted">
                в Safari открой сайт → <span className="text-text">Поделиться → На экран Домой</span>
              </div>
            </div>
          </div>

          <div className="mt-8 rounded-2xl border border-border bg-bg-panel/40 p-5 text-sm text-text-muted leading-relaxed">
            <div className="font-medium text-text mb-2">установка APK на Android</div>
            <ol className="list-decimal pl-5 space-y-1">
              <li>Скачай APK на телефон.</li>
              <li>Открой файл — Android попросит разрешить установку из неизвестных источников. Разреши.</li>
              <li>При первом звонке дай разрешения на микрофон и камеру.</li>
            </ol>
          </div>

          <div className="mt-6 text-xs text-text-subtle">
            Это debug-сборка для тестирования. Подписана отладочным ключом — Google Play Protect может предупредить, это норма.
          </div>
        </div>
      </section>
    </main>
  );
}
