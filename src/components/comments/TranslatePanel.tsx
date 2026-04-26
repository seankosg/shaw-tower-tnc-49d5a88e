import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Languages, RefreshCw, X, Check, Loader2 } from 'lucide-react';
import { useTranslateToEnglish } from '@/hooks/useTranslateToEnglish';
import { useToast } from '@/hooks/use-toast';

interface TranslatePanelProps {
  originalText: string;
  /** Called when user confirms the (possibly edited) English text. */
  onConfirm: (englishText: string) => void;
  /** Called when user cancels and wants to dismiss the panel. */
  onCancel: () => void;
  /** Auto-translate on mount (default true). */
  autoTranslate?: boolean;
}

/**
 * Inline panel that shows the original (Korean) text, runs an AI translation
 * to English, and lets the user edit and confirm the result before saving.
 */
export function TranslatePanel({ originalText, onConfirm, onCancel, autoTranslate = true }: TranslatePanelProps) {
  const { translate, loading, error } = useTranslateToEnglish();
  const { toast } = useToast();
  const [englishText, setEnglishText] = useState('');
  const [hasTranslated, setHasTranslated] = useState(false);

  const runTranslate = async () => {
    const result = await translate(originalText);
    if (result != null) {
      setEnglishText(result);
      setHasTranslated(true);
    }
  };

  useEffect(() => {
    if (autoTranslate && !hasTranslated && !loading) {
      void runTranslate();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (error) {
      toast({ title: 'Translation failed', description: error, variant: 'destructive' });
    }
  }, [error, toast]);

  return (
    <div className="rounded-md border border-primary/30 bg-primary/5 p-2 space-y-2">
      <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
        <Languages className="h-3.5 w-3.5 text-primary" />
        <span className="font-medium text-foreground">Translation preview (English)</span>
        <span className="ml-auto">Edit before sending</span>
      </div>

      <div className="rounded bg-muted/50 px-2 py-1.5 text-[11px] text-muted-foreground border border-border">
        <div className="text-[10px] uppercase tracking-wide text-muted-foreground/70 mb-0.5">Original</div>
        <div className="whitespace-pre-wrap break-words text-foreground/80">{originalText}</div>
      </div>

      <Textarea
        value={englishText}
        onChange={(e) => setEnglishText(e.target.value)}
        rows={3}
        className="resize-none text-sm min-h-0 bg-background"
        placeholder={loading ? 'Translating…' : 'Translation will appear here'}
        disabled={loading}
      />

      <div className="flex items-center gap-1.5 justify-end">
        <Button
          size="sm"
          variant="ghost"
          className="h-7 text-[11px] px-2"
          onClick={onCancel}
          disabled={loading}
        >
          <X className="h-3 w-3 mr-1" /> Cancel
        </Button>
        <Button
          size="sm"
          variant="outline"
          className="h-7 text-[11px] px-2"
          onClick={runTranslate}
          disabled={loading}
        >
          {loading ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <RefreshCw className="h-3 w-3 mr-1" />}
          Re-translate
        </Button>
        <Button
          size="sm"
          className="h-7 text-[11px] px-2"
          onClick={() => onConfirm(englishText.trim())}
          disabled={loading || !englishText.trim()}
        >
          <Check className="h-3 w-3 mr-1" /> Use this
        </Button>
      </div>
    </div>
  );
}
