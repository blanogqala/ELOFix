import { User } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { resolveUploadUrl } from '@/lib/uploadUrl';
import { cn } from '@/lib/utils';

interface ProfileAvatarProps {
  name?: string;
  imageUrl?: string | null;
  className?: string;
  fallbackClassName?: string;
  /** Show generic user icon when name is missing (sidebar style). */
  iconFallback?: boolean;
}

export function ProfileAvatar({
  name,
  imageUrl,
  className,
  fallbackClassName,
  iconFallback = false,
}: ProfileAvatarProps) {
  const src = resolveUploadUrl(imageUrl);
  const initial = name?.trim()?.charAt(0)?.toUpperCase();

  return (
    <Avatar className={cn('h-10 w-10 shrink-0', className)}>
      {src ? <AvatarImage src={src} alt="" referrerPolicy="no-referrer" /> : null}
      <AvatarFallback className={cn('bg-primary/10 text-primary text-sm font-medium', fallbackClassName)}>
        {initial || (iconFallback ? <User className="h-4 w-4" /> : '?')}
      </AvatarFallback>
    </Avatar>
  );
}
