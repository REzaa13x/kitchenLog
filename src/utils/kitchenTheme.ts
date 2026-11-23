export type KitchenThemeKey = 'coworking' | 'container' | 'custom';

export interface KitchenThemeInfo {
  key: KitchenThemeKey;
  label: string;
  description: string;
  accentHex: string;
}

export const KITCHEN_THEMES: Record<KitchenThemeKey, KitchenThemeInfo> = {
  coworking: {
    key: 'coworking',
    label: 'Tema Hijau Hutan',
    description: 'Identitas visual Dapur Coworking (Hijau & Krem Hangat)',
    accentHex: '#1B4332',
  },
  container: {
    key: 'container',
    label: 'Tema Biru Baja',
    description: 'Identitas visual Dapur Container (Biru Baja & Putih Sejuk)',
    accentHex: '#1D4E89',
  },
  custom: {
    key: 'custom',
    label: 'Tema Toska Gelap',
    description: 'Identitas visual lokasi dapur tambahan',
    accentHex: '#115E59',
  },
};

export function resolveKitchenTheme(
  workspaceId?: string | null,
  kitchenName?: string | null
): KitchenThemeInfo {
  const idLower = (workspaceId || '').toLowerCase();
  const nameLower = (kitchenName || '').toLowerCase();

  if (idLower.includes('container') || nameLower.includes('container')) {
    return KITCHEN_THEMES.container;
  }
  if (idLower.includes('coworking') || nameLower.includes('coworking')) {
    return KITCHEN_THEMES.coworking;
  }
  if (!workspaceId && !kitchenName) {
    return KITCHEN_THEMES.coworking;
  }
  return KITCHEN_THEMES.custom;
}
