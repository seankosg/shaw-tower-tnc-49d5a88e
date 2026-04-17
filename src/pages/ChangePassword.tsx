import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { PASSWORD_HINT, PASSWORD_REGEX } from '@/types/enums';

export default function ChangePassword() {
  const { profile, refreshProfile, signOut } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [pw1, setPw1] = useState('');
  const [pw2, setPw2] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (pw1 !== pw2) {
      toast({ title: 'Passwords do not match', variant: 'destructive' });
      return;
    }
    if (!PASSWORD_REGEX.test(pw1)) {
      toast({ title: 'Invalid password', description: PASSWORD_HINT, variant: 'destructive' });
      return;
    }
    setLoading(true);
    const { error: authErr } = await supabase.auth.updateUser({ password: pw1 });
    if (authErr) {
      setLoading(false);
      toast({ title: 'Update failed', description: authErr.message, variant: 'destructive' });
      return;
    }
    if (profile) {
      await supabase.from('profiles').update({ must_change_password: false }).eq('id', profile.id);
    }
    await refreshProfile();
    setLoading(false);
    toast({ title: 'Password updated' });
    navigate('/');
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/40 p-4">
      <Card className="w-full max-w-sm">
        <CardHeader className="text-center">
          <CardTitle className="text-xl font-bold tracking-tight">Change Password</CardTitle>
          <CardDescription>You must set a new password before continuing.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="pw1">New Password</Label>
              <Input id="pw1" type="password" value={pw1} onChange={(e) => setPw1(e.target.value)} required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="pw2">Confirm New Password</Label>
              <Input id="pw2" type="password" value={pw2} onChange={(e) => setPw2(e.target.value)} required />
              <p className="text-xs text-muted-foreground">{PASSWORD_HINT}</p>
            </div>
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? 'Updating...' : 'Update Password'}
            </Button>
            <Button type="button" variant="ghost" className="w-full" onClick={signOut}>
              Sign Out
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
