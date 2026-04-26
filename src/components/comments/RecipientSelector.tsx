import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { Check, Users } from 'lucide-react';

export type RecipientKey = 'hdec_pic' | 'hdec_eng' | 'subcontractor' | 'subsub';

export const RECIPIENT_LABELS: Record<RecipientKey, string> = {
  hdec_pic: 'HDEC PIC',
  hdec_eng: 'HDEC ENG',
  subcontractor: 'Subcontractor',
  subsub: 'Sub-Sub',
};

export const RECIPIENT_ORDER: RecipientKey[] = ['hdec_pic', 'hdec_eng', 'subcontractor', 'subsub'];

export interface RecipientSelectorProps {
  /** Names from the parent record. Empty/null entries are shown disabled. */
  names: Partial<Record<RecipientKey, string | null>>;
  value: RecipientKey[];
  onChange: (value: RecipientKey[]) => void;
  disabled?: boolean;
  required?: boolean;
}

export function RecipientSelector({
  names,
  value,
  onChange,
  disabled,
  required = true,
}: RecipientSelectorProps) {
  const toggle = (key: RecipientKey, available: boolean) => {
    if (disabled || !available) return;
    if (value.includes(key)) {
      onChange(value.filter((v) => v !== key));
    } else {
      onChange([...value, key]);
    }
  };

  return (
    <div className="rounded-md border border-border bg-muted/30 px-2 py-1.5 space-y-1">
      <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
        <Users className="h-3 w-3" />
        <span className="font-medium">To{required ? ' *' : ''}</span>
        {required && value.length === 0 && (
          <span className="text-amber-600">— select at least one recipient</span>
        )}
      </div>
      <div className="flex flex-wrap gap-1">
        {RECIPIENT_ORDER.map((key) => {
          const name = names[key];
          const available = !!name && String(name).trim() !== '';
          const selected = value.includes(key);
          return (
            <button
              key={key}
              type="button"
              onClick={() => toggle(key, available)}
              disabled={disabled || !available}
              title={available ? String(name) : `${RECIPIENT_LABELS[key]} not assigned`}
              className={cn(
                'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] transition-colors',
                selected && available && 'bg-primary text-primary-foreground border-primary',
                !selected && available && 'bg-background text-foreground border-border hover:bg-accent',
                !available && 'bg-muted text-muted-foreground border-border opacity-60 cursor-not-allowed',
                disabled && 'cursor-not-allowed opacity-60',
              )}
            >
              {selected && available && <Check className="h-2.5 w-2.5" />}
              <span>{RECIPIENT_LABELS[key]}</span>
              {available && (
                <span className={cn('text-[10px]', selected ? 'opacity-80' : 'text-muted-foreground')}>
                  · {String(name).length > 14 ? `${String(name).slice(0, 14)}…` : String(name)}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function RecipientBadges({ recipients }: { recipients: string[] | null | undefined }) {
  if (!recipients || recipients.length === 0) return null;
  return (
    <div className="inline-flex flex-wrap items-center gap-1">
      <span className="text-[10px] text-muted-foreground">To:</span>
      {recipients.map((r) => (
        <Badge key={r} variant="secondary" className="h-4 px-1.5 text-[10px]">
          {RECIPIENT_LABELS[r as RecipientKey] ?? r}
        </Badge>
      ))}
    </div>
  );
}
