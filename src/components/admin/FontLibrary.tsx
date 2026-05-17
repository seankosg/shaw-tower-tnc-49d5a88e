import { useEffect, useState, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Upload, Trash2, Star, Loader2 } from 'lucide-react';

interface FontRow {
  id: string;
  family_name: string;
  style: string;
  storage_path: string;
  public_url: string;
  language: 'korean' | 'english' | 'mixed';
  file_size_bytes: number;
  is_default: boolean;
  uploaded_at: string;
}

const BUCKET = 'fonts';

function formatBytes(n: number) {
  if (!n) return '0 B';
  const u = ['B', 'KB', 'MB', 'GB'];
  let i = 0; let v = n;
  while (v >= 1024 && i < u.length - 1) { v /= 1024; i++; }
  return `${v.toFixed(v < 10 && i > 0 ? 1 : 0)} ${u[i]}`;
}

export default function FontLibrary() {
  const { isAdmin, user } = useAuth();
  const { toast } = useToast();
  const [rows, setRows] = useState<FontRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);

  const [familyName, setFamilyName] = useState('');
  const [style, setStyle] = useState('Regular');
  const [language, setLanguage] = useState<'korean' | 'english' | 'mixed'>('mixed');
  const [file, setFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('font_registry')
      .select('*')
      .order('family_name', { ascending: true })
      .order('style', { ascending: true });
    if (error) {
      toast({ title: 'Failed to load fonts', description: error.message, variant: 'destructive' });
    } else {
      setRows((data ?? []) as FontRow[]);
    }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const upload = async () => {
    if (!file || !familyName.trim() || !style.trim()) {
      toast({ title: 'Family name, style, and file are required', variant: 'destructive' });
      return;
    }
    const ext = file.name.split('.').pop()?.toLowerCase();
    if (ext !== 'ttf' && ext !== 'otf') {
      toast({ title: 'Only .ttf or .otf files are allowed', variant: 'destructive' });
      return;
    }
    setUploading(true);
    try {
      const safeFamily = familyName.trim().replace(/[^a-zA-Z0-9_-]+/g, '_');
      const safeStyle = style.trim().replace(/[^a-zA-Z0-9_-]+/g, '_');
      const path = `${safeFamily}/${safeStyle}.${ext}`;
      const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, file, {
        upsert: true,
        contentType: ext === 'ttf' ? 'font/ttf' : 'font/otf',
      });
      if (upErr) throw upErr;
      const { data: pub } = supabase.storage.from(BUCKET).getPublicUrl(path);
      const { error: insErr } = await supabase.from('font_registry').upsert({
        family_name: familyName.trim(),
        style: style.trim(),
        storage_path: path,
        public_url: pub.publicUrl,
        language,
        file_size_bytes: file.size,
        uploaded_by: user?.id ?? null,
      }, { onConflict: 'family_name,style' });
      if (insErr) throw insErr;
      toast({ title: 'Font uploaded' });
      setFile(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
      load();
    } catch (e) {
      toast({ title: 'Upload failed', description: e instanceof Error ? e.message : 'Unknown', variant: 'destructive' });
    } finally {
      setUploading(false);
    }
  };

  const setDefault = async (row: FontRow) => {
    // Clear current default(s) then set this one
    const { error: clr } = await supabase.from('font_registry').update({ is_default: false }).eq('is_default', true);
    if (clr) { toast({ title: 'Failed to clear default', description: clr.message, variant: 'destructive' }); return; }
    const { error } = await supabase.from('font_registry').update({ is_default: true }).eq('id', row.id);
    if (error) {
      toast({ title: 'Failed to set default', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: `Default set: ${row.family_name} ${row.style}` });
      load();
    }
  };

  const remove = async (row: FontRow) => {
    if (row.is_default) {
      toast({ title: 'Cannot delete the default font', description: 'Set another font as default first.', variant: 'destructive' });
      return;
    }
    if (!confirm(`Delete ${row.family_name} ${row.style}?`)) return;
    const { error: delObj } = await supabase.storage.from(BUCKET).remove([row.storage_path]);
    if (delObj) {
      toast({ title: 'Storage delete failed', description: delObj.message, variant: 'destructive' });
      return;
    }
    const { error } = await supabase.from('font_registry').delete().eq('id', row.id);
    if (error) {
      toast({ title: 'Delete failed', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: 'Font deleted' });
      load();
    }
  };

  if (!isAdmin) {
    return <div className="text-sm text-muted-foreground">Admin only.</div>;
  }

  // Group by family for display
  const grouped = new Map<string, FontRow[]>();
  for (const r of rows) {
    const list = grouped.get(r.family_name) ?? [];
    list.push(r);
    grouped.set(r.family_name, list);
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Font Library</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Built-in entry */}
          <div className="rounded-md border bg-muted/30 p-3 text-sm">
            <div className="flex items-center gap-2">
              <Badge variant="secondary">built-in</Badge>
              <span className="font-semibold">Malgun Gothic</span>
              <span className="text-muted-foreground">— Windows default, no upload required, always available.</span>
            </div>
          </div>

          {/* Upload form */}
          <div className="rounded-md border p-4 space-y-3">
            <div className="text-sm font-semibold">Upload Font</div>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
              <div>
                <Label className="text-xs">Family name</Label>
                <Input value={familyName} onChange={(e) => setFamilyName(e.target.value)} placeholder="e.g. Pretendard" />
              </div>
              <div>
                <Label className="text-xs">Style</Label>
                <Input value={style} onChange={(e) => setStyle(e.target.value)} placeholder="Regular / Bold / Light / ..." />
              </div>
              <div>
                <Label className="text-xs">Language</Label>
                <Select value={language} onValueChange={(v) => setLanguage(v as typeof language)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="mixed">Mixed</SelectItem>
                    <SelectItem value="korean">Korean</SelectItem>
                    <SelectItem value="english">English</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">File (.ttf / .otf)</Label>
                <Input ref={fileInputRef} type="file" accept=".ttf,.otf" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
              </div>
            </div>
            <div>
              <Button onClick={upload} disabled={uploading || !file}>
                {uploading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Upload className="h-4 w-4 mr-2" />}
                Upload
              </Button>
            </div>
          </div>

          {/* List */}
          <div>
            <div className="mb-2 text-sm font-semibold">Registered Fonts</div>
            {loading ? (
              <div className="text-sm text-muted-foreground">Loading…</div>
            ) : grouped.size === 0 ? (
              <div className="text-sm text-muted-foreground">No custom fonts uploaded yet.</div>
            ) : (
              <div className="space-y-4">
                {Array.from(grouped.entries()).map(([family, styles]) => {
                  const totalSize = styles.reduce((s, r) => s + (r.file_size_bytes ?? 0), 0);
                  const lang = styles[0]?.language ?? 'mixed';
                  return (
                    <div key={family} className="rounded-md border">
                      <div className="flex items-center justify-between border-b bg-muted/30 px-4 py-2">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold">{family}</span>
                          <Badge variant="outline">{lang}</Badge>
                          <span className="text-xs text-muted-foreground">{styles.length} styles · {formatBytes(totalSize)}</span>
                        </div>
                      </div>
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Style</TableHead>
                            <TableHead>Size</TableHead>
                            <TableHead>Uploaded</TableHead>
                            <TableHead>Default</TableHead>
                            <TableHead className="text-right">Actions</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {styles.map((r) => (
                            <TableRow key={r.id}>
                              <TableCell>{r.style}</TableCell>
                              <TableCell>{formatBytes(r.file_size_bytes)}</TableCell>
                              <TableCell>{new Date(r.uploaded_at).toLocaleDateString()}</TableCell>
                              <TableCell>
                                {r.is_default ? (
                                  <Badge><Star className="h-3 w-3 mr-1" /> default</Badge>
                                ) : (
                                  <Button size="sm" variant="outline" onClick={() => setDefault(r)}>
                                    Set default
                                  </Button>
                                )}
                              </TableCell>
                              <TableCell className="text-right">
                                <Button size="sm" variant="ghost" disabled={r.is_default} onClick={() => remove(r)}>
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
