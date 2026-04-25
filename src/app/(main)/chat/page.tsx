import { MessageSquare } from 'lucide-react';

export default function ChatHomePage() {
  return (
    <div className="flex-1 flex items-center justify-center text-center p-6">
      <div className="animate-fade-in">
        <div className="w-20 h-20 rounded-3xl bg-bg-panel border border-border flex items-center justify-center mx-auto mb-5">
          <MessageSquare className="w-9 h-9 text-text-muted" />
        </div>
        <h2 className="text-xl font-medium">выбери диалог</h2>
        <p className="text-text-muted text-sm mt-2 max-w-sm">
          или найди тюбика во вкладке «друзья» и начни переписку
        </p>
      </div>
    </div>
  );
}
