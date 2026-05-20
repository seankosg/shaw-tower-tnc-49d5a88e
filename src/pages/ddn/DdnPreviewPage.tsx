import { useMemo, useState } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { useDdnSchema, useDdnSettings, useDdnEntry } from '@/lib/ddn/schema-cache';
import { useDdnMappingRules } from '@/lib/ddn/mapping-cache';
import { buildLetter } from '@/lib/ddn/mapping-engine';
import { generateAndUploadDocx, downloadDocxFromStorage, renderDocxBlob } from '@/lib/ddn/docx-generator';
import type { DdnInputs } from '@/lib/ddn/schema-types';

function todayIso() { return new Date().toISOString().slice(0, 10); }

export default function DdnPreviewPage() {
  const [sp, setSp] = useSearchParams();
  const initialDate = sp.get('date') || todayIso();
  const [entryDate, setEntryDate] = useState(initialDate);
  const [showDebug, setShowDebug] = useState(false);

  const { data: schema } = useDdnSchema();
  const { data: settings } = useDdnSettings();
  const { data: entry } = useDdnEntry(entryDate);
  const { data: rules } = useDdnMappingRules();

  const dayN = useMemo(() => {
    if (!settings?.day1_date) return null;
    const ms = new Date(entryDate).getTime() - new Date(settings.day1_date).getTime();
    return Math.floor(ms / 86400000) + 1;
  }, [settings?.day1_date, entryDate]);

  const letter = useMemo(() => {
    if (!schema || !rules) return null;
    const letterNo = entry?.letter_no
      ?? `${settings?.letter_no_prefix ?? 'DDN'}-${settings?.letter_no_next ?? '___'}`;
    return buildLetter({
      inputs: (entry?.inputs as DdnInputs) ?? {},
      settings: settings ?? null,
      fields: schema.fields,
      rules,
      sections: schema.sections.map((s) => ({ id: s.id, title_en: s.title_en, display_order: s.display_order })),
      entryDate,
      dayN,
      letterNo,
    });
  }, [schema, rules, settings, entry, entryDate, dayN]);

  const onDateChange = (v: string) => {
    const next = v || todayIso();
    setEntryDate(next);
    setSp({ date: next });
  };

  if (!schema || !rules) {
    return <p className="text-sm text-muted-foreground">Loading…</p>;
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="flex flex-wrap items-end gap-3 p-4 print:hidden">
          <div>
            <Label className="text-xs">Date</Label>
            <Input type="date" className="w-44" value={entryDate} onChange={(e) => onDateChange(e.target.value)} />
          </div>
          <div>
            <Label className="text-xs">Day N</Label>
            <div className="rounded-md border bg-muted/30 px-3 py-2 text-sm font-mono w-24">{dayN ?? '—'}</div>
          </div>
          <Badge variant={entry?.status === 'finalized' ? 'default' : 'secondary'}>
            {entry?.status ?? 'draft'}
          </Badge>
          <div className="ml-auto flex items-center gap-2">
            <Button variant="outline" size="sm" asChild>
              <Link to={`/ddn/input?date=${entryDate}`}>Open Editor</Link>
            </Button>
            <Button variant="outline" size="sm" onClick={() => window.print()}>Print</Button>
            <Button variant="ghost" size="sm" onClick={() => setShowDebug((v) => !v)}>
              {showDebug ? 'Hide' : 'Show'} debug
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-12 gap-4">
        <div className={showDebug ? 'col-span-12 lg:col-span-9' : 'col-span-12'}>
          <div className="mx-auto rounded-md border bg-white shadow-sm print:shadow-none print:border-0"
               style={{ maxWidth: '210mm', minHeight: '297mm', padding: '25mm 20mm' }}>
            <LetterBody letter={letter} />
          </div>
        </div>

        {showDebug && (
          <div className="col-span-12 lg:col-span-3 print:hidden">
            <Card>
              <CardContent className="p-3 space-y-3 text-xs">
                <div>
                  <div className="font-semibold mb-1">Warnings ({letter?.warnings.length ?? 0})</div>
                  {letter && letter.warnings.length === 0 ? (
                    <p className="text-muted-foreground">None.</p>
                  ) : (
                    <ul className="space-y-0.5 max-h-72 overflow-auto">
                      {letter?.warnings.map((w, i) => (
                        <li key={i} className="text-amber-700">{w}</li>
                      ))}
                    </ul>
                  )}
                </div>
                <div>
                  <div className="font-semibold mb-1">Rules used</div>
                  <ul className="space-y-0.5 max-h-72 overflow-auto font-mono">
                    {letter?.sections.flatMap((s) => s.blocks.map((b) => b.ruleKey)).map((k, i) => (
                      <li key={i}>{k}</li>
                    ))}
                  </ul>
                </div>
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}

function LetterBody({ letter }: { letter: ReturnType<typeof buildLetter> | null }) {
  if (!letter) return null;
  return (
    <div className="text-[11pt] leading-relaxed" style={{ fontFamily: '"Source Serif Pro", "Georgia", serif', color: '#111' }}>
      <div className="flex justify-between text-[10pt] mb-6">
        <div>
          <div><strong>Ref:</strong> {letter.letterNo}</div>
          <div><strong>Date:</strong> {letter.date}</div>
        </div>
        <div className="text-right">
          <div><strong>HDEC Singapore Project</strong></div>
          <div className="text-muted-foreground">Daily Default Notice</div>
        </div>
      </div>
      <h1 className="text-[13pt] font-bold mb-4 text-center">
        Subject: Daily Default Notice{letter.dayN != null ? ` — Day ${letter.dayN}` : ''}
      </h1>

      {letter.sections.length === 0 && (
        <p className="italic text-muted-foreground">No content generated. Fill in the input form and ensure mapping rules are active.</p>
      )}

      {letter.sections.map((sec, idx) => (
        <section key={sec.id} className="mb-5">
          <h2 className="text-[11.5pt] font-semibold border-b border-neutral-300 mb-2 pb-0.5">
            {idx + 1}. {sec.titleEn}
          </h2>
          <div className="space-y-2">
            {sec.blocks.map((b, i) => {
              if (b.kind === 'heading') return <h3 key={i} className="font-semibold">{b.text}</h3>;
              if (b.kind === 'bullet') return (
                <ul key={i} className="list-disc pl-5 space-y-0.5">
                  {b.items.map((it, j) => <li key={j}>{it}</li>)}
                </ul>
              );
              return <p key={i} className="text-justify">{b.html}</p>;
            })}
          </div>
        </section>
      ))}

      <div className="mt-12 text-[10pt]">
        <p>Yours faithfully,</p>
        <p className="mt-10">________________________</p>
        <p>HDEC Singapore Project Director</p>
      </div>
    </div>
  );
}
