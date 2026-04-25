import { useMemo, useState } from 'react';
import { Check, ChevronsUpDown, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { cn } from '@/lib/utils';

export interface SuggestFieldProps {
  label: string;
  value: string | null | undefined;
  options: string[];
  onChange: (value: string | null) => void;
  disabled?: boolean;
  placeholder?: string;
  required?: boolean;
}

/**
 * Combobox: searchable dropdown of existing values that ALSO accepts free-text input.
 * - Click to open. Type to filter.
 * - If typed text matches no option, an extra "Use \"<typed>\"" item lets the user save it as-is.
 * - "Clear" option resets the field to null.
 */
export function SuggestField({ label, value, options, onChange, disabled, placeholder, required }: SuggestFieldProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');

  const sortedOptions = useMemo(() => {
    const cleaned = Array.from(new Set(options.map((o) => (o ?? '').trim()).filter(Boolean)));
    cleaned.sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
    return cleaned;
  }, [options]);

  const trimmedSearch = search.trim();
  const exactMatch = trimmedSearch.length > 0 && sortedOptions.some((o) => o.toLowerCase() === trimmedSearch.toLowerCase());
  const showCustomOption = trimmedSearch.length > 0 && !exactMatch;

  const commit = (next: string | null) => {
    onChange(next);
    setSearch('');
    setOpen(false);
  };

  const display = value ?? '';

  return (
    <div className="space-y-1">
      <label className="text-xs font-medium text-muted-foreground">{label}{required ? ' *' : ''}</label>
      <Popover open={open} onOpenChange={(next) => { if (!disabled) setOpen(next); if (!next) setSearch(''); }}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            role="combobox"
            aria-expanded={open}
            disabled={disabled}
            className={cn('h-9 w-full justify-between font-normal', !display && 'text-muted-foreground', disabled && 'bg-muted text-foreground opacity-100 cursor-not-allowed')}
          >
            <span className="truncate text-left">{display || (placeholder ?? '—')}</span>
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0 bg-popover" align="start">
          <Command shouldFilter={true}>
            <CommandInput
              placeholder="Search or type a new value..."
              value={search}
              onValueChange={setSearch}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && showCustomOption) {
                  e.preventDefault();
                  commit(trimmedSearch);
                }
              }}
            />
            <CommandList className="max-h-64">
              <CommandEmpty>{showCustomOption ? null : 'No existing values.'}</CommandEmpty>
              {showCustomOption && (
                <CommandGroup heading="New value">
                  <CommandItem value={`__use_${trimmedSearch}`} onSelect={() => commit(trimmedSearch)}>
                    <Check className="mr-2 h-4 w-4 opacity-0" />
                    Use "{trimmedSearch}"
                  </CommandItem>
                </CommandGroup>
              )}
              {sortedOptions.length > 0 && (
                <CommandGroup heading="Existing values">
                  {sortedOptions.map((opt) => (
                    <CommandItem key={opt} value={opt} onSelect={() => commit(opt)}>
                      <Check className={cn('mr-2 h-4 w-4', value === opt ? 'opacity-100' : 'opacity-0')} />
                      {opt}
                    </CommandItem>
                  ))}
                </CommandGroup>
              )}
              {value && (
                <CommandGroup>
                  <CommandItem value="__clear__" onSelect={() => commit(null)} className="text-destructive">
                    <X className="mr-2 h-4 w-4" />
                    Clear value
                  </CommandItem>
                </CommandGroup>
              )}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  );
}

export default SuggestField;
