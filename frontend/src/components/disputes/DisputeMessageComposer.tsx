import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Loader2, Send } from 'lucide-react';

interface DisputeMessageComposerProps {
  disabled?: boolean;
  placeholder?: string;
  onSend: (body: string) => Promise<void>;
}

export function DisputeMessageComposer({
  disabled,
  placeholder = 'Write a message…',
  onSend,
}: DisputeMessageComposerProps) {
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);

  const handleSend = async () => {
    const text = body.trim();
    if (!text || sending || disabled) return;
    setSending(true);
    try {
      await onSend(text);
      setBody('');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
      <Textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder={placeholder}
        rows={2}
        disabled={disabled || sending}
        className="min-h-[72px] flex-1 resize-none"
        onKeyDown={(e) => {
          if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            void handleSend();
          }
        }}
      />
      <Button
        type="button"
        className="shrink-0 sm:mb-0"
        disabled={disabled || sending || !body.trim()}
        onClick={() => void handleSend()}
      >
        {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
        <span className="ml-2">Send</span>
      </Button>
    </div>
  );
}
