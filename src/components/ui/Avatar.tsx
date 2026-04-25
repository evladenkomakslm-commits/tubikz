'use client';
import { cn, avatarColor, initials } from '@/lib/utils';

interface AvatarProps {
  src?: string | null;
  name: string;
  size?: number;
  online?: boolean;
  className?: string;
}

export function Avatar({ src, name, size = 40, online, className }: AvatarProps) {
  const dim = { width: size, height: size };
  return (
    <div className="relative inline-flex shrink-0">
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt={name}
          style={dim}
          className={cn('rounded-full object-cover bg-bg-elevated', className)}
        />
      ) : (
        <div
          style={dim}
          className={cn(
            'rounded-full flex items-center justify-center font-medium select-none',
            avatarColor(name),
            className,
          )}
        >
          <span style={{ fontSize: Math.max(11, size * 0.35) }}>
            {initials(name)}
          </span>
        </div>
      )}
      {online !== undefined && (
        <span
          className={cn(
            'absolute bottom-0 right-0 w-3 h-3 rounded-full ring-2 ring-bg',
            online ? 'bg-success' : 'bg-text-subtle',
          )}
        />
      )}
    </div>
  );
}
