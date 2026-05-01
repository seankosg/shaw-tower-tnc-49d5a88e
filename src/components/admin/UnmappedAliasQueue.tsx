import { useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { findSimilarMasterName } from '@/lib/master-name-match';
import { Check, RefreshCw, Sparkles, X } from 'lucide-react';

interface AliasRow { id: string; raw_label: string; subcontractor_id: string | null; is_active: boolean; }
interface SubMaster { id: string; name: string; is_active: boolean; }

interface Props {
  aliases: AliasRow[];
  subs: SubMaster[];
  onChanged: () => void;
}

export function UnmappedAliasQueue({ aliases, subs, onChanged }: Props) {
  const { toast } = useToast();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);

  const activeSubs = useMemo(() => subs.filter(s => s.is_active), [subs]);

  const enriched = useMemo(() => {
    return aliases.map(a => {
      const match = findSimilarMasterName(a.raw_label, activeSubs);
      return { alias: a, suggestion: match };
    });
  }, [aliases, activeSubs]);

  if (aliases.length === 0) return null;

  const toggle = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    setSelected(prev => prev.size === aliases.length ? new Set() : new Set(aliases.map(a => a.id)));
  };

  const mapOne = async (aliasId: string, subId: string) => {
    if (!subId) return;
    const { error } = await (supabase as any)
      .from('docs_org_alias')
      .update({ subcontractor_id: subId })
      .eq('id', aliasId);
    if (error) { toast({ title: 'Map failed', description: error.message, variant: 'destructive' }); return; }
    toast({ title: 'Alias mapped' });
    setSelected(prev => { const n = new Set(prev); n.delete(aliasId); return n; });
    onChanged();
  };

  const ignoreOne = async (aliasId: string) => {
    const { error } = await (supabase as any)
      .from('docs_org_alias')
      .update({ is_active: false })
      .eq('id', aliasId);
    if (error) { toast({ title: 'Ignore failed', description: error.message, variant: 'destructive' }); return; }
    setSelected(prev => { const n = new Set(prev); n.delete(aliasId); return n; });
    onChanged();
  };

  const bulkIgnore = async () => {
    if (selected.size === 0) return;
    setBusy(true);
    const { error } = await (supabase as any)
      .from('docs_org_alias')
      .update({ is_active: false })
      .in('id', [...selected]);
    setBusy(false);
    if (error) { toast({ title: 'Bulk ignore failed', description: error.message, variant: 'destructive' }); return; }
    toast({ title: `${selected.size} alias(es) ignored` });
    setSelected(new Set());
    onChanged();
  };

  const bulkAcceptSuggested = async () => {
    const targets = enriched.filter(e => selected.has(e.alias.id) && e.suggestion && e.suggestion.score >= 0.85);
    if (targets.length === 0) {
      toast({ title: 'No high-confidence suggestions in selection', variant: 'destructive' });
      return;
    }
    setBusy(true);
    let ok = 0, fail = 0;
    for (const t of targets) {
      const sub = activeSubs.find(s => s.name === t.suggestion!.candidate.name);
      if (!sub) { fail++; continue; }
      const { error } = await (supabase as any)
        .from('docs_org_alias')
        .update({ subcontractor_id: sub.id })
        .eq('id', t.alias.id);
      if (error) fail++; else ok++;
    }
    setBusy(false);
    toast({ title: `Accepted ${ok}${fail ? `, ${fail} failed` : ''}` });
    setSelected(new Set());
    onChanged();
  };

  const allChecked = selected.size === aliases.length && aliases.length > 0;
  const highConfSelected = enriched.filter(e => selected.has(e.alias.id) && e.suggestion && e.suggestion.score >= 0.85).length;

  return (
    <Card className="border-amber-300/60 bg-amber-50/30 dark:bg-amber-950/10">
      <CardHeader id="unmapped-aliases-anchor" className="flex flex-row items-center justify-between gap-2 space-y-0">
        <div className="flex items-center gap-2">
          <CardTitle className="text-base">Unmapped Aconex Aliases</CardTitle>
          <Badge variant="outline" className="border-amber-400 bg-amber-100 text-amber-900">
            {aliases.length}
          </Badge>
        </div>
        <div className="flex items-center gap-2">
          {selected.size > 0 && (
            <>
              <Button
                size="sm"
                variant="outline"
                onClick={bulkAcceptSuggested}
                disabled={busy || highConfSelected === 0}
                className="gap-1"
              >
                <Sparkles className="h-3.5 w-3.5" />
                Accept suggested ({highConfSelected})
              </Button>
              <Button size="sm" variant="outline" onClick={bulkIgnore} disabled={busy}>
                Ignore ({selected.size})
              </Button>
            </>
          )}
          <Button size="sm" variant="ghost" onClick={onChanged} title="Refresh">
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <p className="mb-2 text-xs text-muted-foreground">
          Organisation labels found in Docs imports that are not yet mapped to a Subcontractor. Map them so future imports are absorbed automatically.
        </p>
        <div className="rounded-md border bg-background">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10">
                  <Checkbox checked={allChecked} onCheckedChange={toggleAll} aria-label="Select all" />
                </TableHead>
                <TableHead>Raw Label</TableHead>
                <TableHead className="w-[260px]">Suggested Match</TableHead>
                <TableHead className="w-[240px]">Map to Subcontractor</TableHead>
                <TableHead className="w-20 text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {enriched.map(({ alias, suggestion }) => {
                const score = suggestion?.score ?? 0;
                const high = score >= 0.85;
                return (
                  <TableRow key={alias.id}>
                    <TableCell>
                      <Checkbox checked={selected.has(alias.id)} onCheckedChange={() => toggle(alias.id)} />
                    </TableCell>
                    <TableCell className="font-mono text-xs">{alias.raw_label}</TableCell>
                    <TableCell>
                      {suggestion ? (
                        <div className="flex items-center gap-2">
                          <span className="text-xs">{suggestion.candidate.name}</span>
                          <Badge variant={high ? 'default' : 'secondary'} className="text-[10px]">
                            {Math.round(score * 100)}%
                          </Badge>
                          <Button
                            size="sm"
                            variant={high ? 'default' : 'outline'}
                            className="h-6 gap-1 px-2 text-[10px]"
                            onClick={() => {
                              const s = activeSubs.find(s => s.name === suggestion.candidate.name);
                              if (s) mapOne(alias.id, s.id);
                            }}
                          >
                            <Check className="h-3 w-3" /> Accept
                          </Button>
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <Select onValueChange={(v) => mapOne(alias.id, v)}>
                        <SelectTrigger className="h-8 text-xs">
                          <SelectValue placeholder="— select —" />
                        </SelectTrigger>
                        <SelectContent>
                          {activeSubs.map(s => (
                            <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button size="sm" variant="ghost" onClick={() => ignoreOne(alias.id)} className="gap-1">
                        <X className="h-3.5 w-3.5" /> Ignore
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}
