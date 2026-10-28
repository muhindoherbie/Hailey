import type { Accessory } from '../components/Avatar';
import { useSession } from './session';
import { useData } from './hooks';

const PERSONA_HAT: Record<string, Accessory> = { chef: 'chef', tutor: 'cap', coach: 'headband' };
const NEEDS: Partial<Record<Accessory, string>> = { crown: 'legendary', chef: 'chef', cap: 'tutor', headband: 'coach' };

/** Which accessory Hailey wears, and which ones the user has earned. */
export function useMascot() {
  const { me } = useSession();
  const a = useData<any>('/achievements', { cache: true });
  const profile = me!.settings.profile;
  const unlocked = new Set<string>(['party', ...(a.data?.personas ?? []).filter((p: any) => p.unlocked).map((p: any) => p.id), ...(a.data?.legendary ? ['legendary'] : [])]);
  const earned = (acc: Accessory) => acc === 'none' || !NEEDS[acc] || unlocked.has(NEEDS[acc]!);
  const choice = (profile.mascotAccessory ?? 'auto') as Accessory | 'auto';
  const accessory: Accessory = choice !== 'auto'
    ? (earned(choice) ? choice : 'none')
    : PERSONA_HAT[profile.persona] ?? (a.data?.legendary ? 'crown' : 'none');
  return { accessory, achievements: a.data, earned, name: profile.assistantName || 'Hailey' };
}
