import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { SafeAreaView, View, Text, TouchableOpacity, FlatList, StatusBar, StyleSheet, Alert, ActivityIndicator } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Haptics from 'expo-haptics';
import { CameraView, useCameraPermissions } from 'expo-camera';
import type { BarcodeScanningResult } from 'expo-camera';
import { Home as HomeIcon, History as HistoryIcon, Settings as SettingsIcon, ScanLine, ChevronLeft, Star, StarOff } from 'lucide-react-native';

const ACCENT = '#24D3A8';
const BG = '#0A0E10';
const BG_ELEV = '#12181B';
const TEXT = '#E8F0F2';
const MUTED = '#9AA5AB';

type TabKey = 'Home' | 'History' | 'Settings';
type StackKey = 'Root' | 'Scan' | 'Result';

type HistoryItem = {
id: string; // barcode or manual id
name?: string;
barcodeData?: string;
scannedAt: number;
isFavorite?: boolean;
pufaFlag?: 'unknown' | 'low' | 'medium' | 'high';
ingredients?: string;
  polyunsaturatedFatPer100g?: number;
  matchedSeedOils?: string[];
};

const STORAGE_KEYS = {
HISTORY: '@pufa_history',
};

function useHistory() {
const [history, setHistory] = useState<HistoryItem[]>([]);
const [loading, setLoading] = useState(true);

const load = useCallback(async () => {
setLoading(true);
try {
const raw = await AsyncStorage.getItem(STORAGE_KEYS.HISTORY);
if (raw) setHistory(JSON.parse(raw));
} catch (e) {
console.warn('Failed to load history', e);
} finally {
setLoading(false);
}
}, []);

  const persist = useCallback(async (items: HistoryItem[]) => {
    setHistory(items);
    try {
      await AsyncStorage.setItem(STORAGE_KEYS.HISTORY, JSON.stringify(items));
    } catch (e) {
      console.warn('Failed to save history', e);
    }
  }, []);

  const add = useCallback(async (item: HistoryItem) => {
    const items = [item, ...history].slice(0, 200);
    await persist(items);
  }, [history, persist]);

const toggleFavorite = useCallback(async (id: string) => {
const items = history.map(h => h.id === id ? { ...h, isFavorite: !h.isFavorite } : h);
await persist(items);
}, [history, persist]);

const remove = useCallback(async (id: string) => {
const items = history.filter(h => h.id !== id);
await persist(items);
}, [history, persist]);

  const update = useCallback(async (id: string, changes: Partial<HistoryItem>) => {
    const items = history.map(h => h.id === id ? { ...h, ...changes } : h);
    await persist(items);
    return items.find(h => h.id === id);
  }, [history, persist]);

useEffect(() => { load(); }, [load]);

  return { history, loading, add, toggleFavorite, remove, update, reload: load };
}

export default function App() {
const [tab, setTab] = useState<TabKey>('Home');
const [stack, setStack] = useState<StackKey>('Root');
const [result, setResult] = useState<HistoryItem | null>(null);
  const { history, loading, add, toggleFavorite, update } = useHistory();

  const enrichItemWithOpenFoodFacts = useCallback(async (item: HistoryItem): Promise<HistoryItem | undefined> => {
    if (!item.barcodeData) return;
    try {
      // Use minimal field filter to avoid field path incompatibilities on some OFF mirrors
      const url = `https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(item.barcodeData)}.json`;
      const res = await fetch(url);
      const json = await res.json();
      const product = json?.product;
      if (!product) return;

      const name: string | undefined = product.product_name;
      const ingredientsText: string | undefined = product.ingredients_text_en || product.ingredients_text;
      const polyFat: number | undefined = product?.nutriments?.['polyunsaturated-fat_100g'];

      const analysis = analyzePufa(ingredientsText, polyFat);

      const updated: Partial<HistoryItem> = {
        name: name || item.name,
        ingredients: ingredientsText || item.ingredients,
        polyunsaturatedFatPer100g: typeof polyFat === 'number' ? polyFat : item.polyunsaturatedFatPer100g,
        pufaFlag: analysis.flag,
        matchedSeedOils: analysis.matchedSeedOils,
      };
      const newItem = await update(item.id, updated);
      if (newItem && result && result.id === item.id) setResult(newItem);
      return newItem;
    } catch (e) {
      console.warn('OpenFoodFacts lookup failed', e);
    }
  }, [result, update]);

  function analyzePufa(ingredientsText?: string, polyFatPer100g?: number): { flag: NonNullable<HistoryItem['pufaFlag']>; matchedSeedOils: string[] } {
    const normalized = (ingredientsText || '').toLowerCase();
    const seedOilKeywords = [
      'canola oil', 'rapeseed oil', 'soybean oil', 'soy oil', 'corn oil', 'sunflower oil', 'safflower oil', 'cottonseed oil', 'grapeseed oil', 'rice bran oil', 'vegetable oil', 'mixed vegetable oils'
    ];
    const matchedSeedOils = seedOilKeywords.filter((k) => normalized.includes(k));

    let flag: NonNullable<HistoryItem['pufaFlag']> = 'unknown';
    if (typeof polyFatPer100g === 'number') {
      if (polyFatPer100g >= 10) flag = 'high';
      else if (polyFatPer100g >= 4) flag = 'medium';
      else flag = matchedSeedOils.length > 0 ? 'high' : 'low';
    } else if (matchedSeedOils.length > 0) {
      flag = 'high';
    } else if (normalized.includes('olive oil') || normalized.includes('butter') || normalized.includes('avocado oil')) {
      flag = 'low';
    }
    return { flag, matchedSeedOils };
  }

const goScan = useCallback(() => {
setStack('Scan');
Haptics.selectionAsync();
}, []);

const goResult = useCallback((item: HistoryItem) => {
setResult(item);
setStack('Result');
}, []);

const back = useCallback(() => {
if (stack === 'Result') setStack('Root');
else if (stack === 'Scan') setStack('Root');
}, [stack]);

return (
<SafeAreaView style={styles.safe}>
<StatusBar barStyle="light-content" />
<View style={styles.container}>
<Header
title={stack === 'Scan' ? 'Scan' : stack === 'Result' ? 'Result' : tab}
onBack={stack !== 'Root' ? back : undefined}
/>
{stack === 'Root' && (
      <>
        {tab === 'Home' && (
          <HomeScreen
            onPressScan={goScan}
            recent={history.slice(0, 8)}
            onOpenResult={goResult}
          />
        )}
        {tab === 'History' && (
          <HistoryScreen
            loading={loading}
            items={history}
            onOpen={goResult}
            onToggleFavorite={toggleFavorite}
          />
        )}
        {tab === 'Settings' && <SettingsScreen />}
      </>
    )}

    {stack === 'Scan' && (
      <ScanScreen
        onScanned={async (barcode) => {
          const item: HistoryItem = {
            id: barcode.data || String(Date.now()),
            barcodeData: barcode.data,
            scannedAt: Date.now(),
            pufaFlag: 'unknown',
          };
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          await add(item);
          const enriched = await enrichItemWithOpenFoodFacts(item);
          goResult(enriched || item);
        }}
      />
    )}

    {stack === 'Result' && result && (
      <ResultScreen
        item={result}
        onToggleFavorite={() => toggleFavorite(result.id)}
      />
    )}

    <TabBar tab={tab} onChange={setTab} disabled={stack !== 'Root'} />
  </View>
</SafeAreaView>
);
}
function Header({ title, onBack }: { title: string; onBack?: () => void }) {
return (
<View style={styles.header}>
{onBack ? (
<TouchableOpacity onPress={onBack} style={styles.backBtn} accessibilityLabel="Go back">
<ChevronLeft size={24} color={TEXT} />
</TouchableOpacity>
) : (
<View style={styles.backBtnPlaceholder} />
)}
<Text style={styles.headerTitle}>{title}</Text>
<View style={styles.backBtnPlaceholder} />
</View>
);
}

function HomeScreen({
onPressScan,
recent,
onOpenResult,
}: {
onPressScan: () => void;
recent: HistoryItem[];
onOpenResult: (item: HistoryItem) => void;
}) {
  return (
<View style={styles.screen}>
<View style={styles.card}>
<Text style={styles.title}>PUFA Check</Text>
<Text style={styles.subtitle}>Scan packaged foods to flag seed oils & high-PUFA content.</Text>
<TouchableOpacity onPress={onPressScan} style={styles.primaryBtn} accessibilityLabel="Start barcode scan">
<ScanLine size={18} color="#00150F" />
<Text style={styles.primaryBtnText}>Scan a Barcode</Text>
</TouchableOpacity>
</View>
<View style={styles.section}>
    <Text style={styles.sectionTitle}>Recent</Text>
    {recent.length === 0 ? (
      <Text style={styles.muted}>No scans yet. Tap “Scan a Barcode” to begin.</Text>
    ) : (
      <FlatList
        data={recent}
        keyExtractor={(it) => it.id}
        renderItem={({ item }) => (
          <TouchableOpacity onPress={() => onOpenResult(item)} style={styles.row}>
            <View style={styles.rowCol}>
              <Text style={styles.rowTitle}>{item.name || item.barcodeData || 'Unknown item'}</Text>
              <Text style={styles.rowMeta}>{new Date(item.scannedAt).toLocaleString()}</Text>
            </View>
            <Badge flag={item.pufaFlag || 'unknown'} />
          </TouchableOpacity>
        )}
      />
    )}
  </View>
</View>
);
}
function ScanScreen({ onScanned }: { onScanned: (res: BarcodeScanningResult) => void }) {
const [permission, requestPermission] = useCameraPermissions();
const [scanned, setScanned] = useState(false);

useEffect(() => {
if (!permission) return;
if (!permission.granted) requestPermission();
}, [permission, requestPermission]);

if (!permission) {
return (
<View style={[styles.screen, styles.center]}>
<ActivityIndicator />
<Text style={styles.muted}>Requesting camera permission…</Text>
</View>
);
}

if (!permission.granted) {
return (
<View style={[styles.screen, styles.center]}>
<Text style={styles.subtitle}>Camera permission is required to scan barcodes.</Text>
<TouchableOpacity onPress={requestPermission} style={styles.primaryBtn}>
<Text style={styles.primaryBtnText}>Grant Permission</Text>
</TouchableOpacity>
</View>
);
}

return (
<View style={{ flex: 1, backgroundColor: BG }}>
<CameraView
style={{ flex: 1 }}
  facing="back"
  barcodeScannerSettings={{
    barcodeTypes: [
      'ean13',
      'ean8',
      'upc_e',
      'code39',
      'code93',
      'code128',
      'itf14',
      'qr',
      'pdf417',
    ],
  }}
onBarcodeScanned={(res) => {
if (scanned) return;
setScanned(true);
onScanned(res);
}}
/>
<View style={styles.scanOverlay}>
<Text style={styles.scanHint}>Align the barcode within the frame</Text>
</View>
</View>
);
}

function ResultScreen({ item, onToggleFavorite }: { item: HistoryItem; onToggleFavorite: () => void }) {
const flagText = useMemo(() => {
switch (item.pufaFlag) {
case 'low': return 'Likely Low PUFA';
case 'medium': return 'Moderate PUFA';
case 'high': return 'High PUFA (seed oils likely)';
default: return 'Analysis Pending';
}
}, [item.pufaFlag]);

  const isEnrichmentPending = useMemo(() => {
    return !!item.barcodeData && !item.ingredients && item.pufaFlag === 'unknown';
  }, [item.barcodeData, item.ingredients, item.pufaFlag]);

return (
<View style={styles.screen}>
<View style={styles.card}>
<View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
<Text style={styles.title}>{item.name || item.barcodeData || 'Unknown item'}</Text>
<TouchableOpacity onPress={onToggleFavorite} accessibilityLabel="Toggle favorite">
{item.isFavorite ? <Star size={22} color={ACCENT} /> : <StarOff size={22} color={MUTED} />}
</TouchableOpacity>
</View>
<View style={{ marginTop: 8 }}>
<Badge flag={item.pufaFlag || 'unknown'} />
</View>
<Text style={[styles.subtitle, { marginTop: 12 }]}>{flagText}</Text>
<View style={[styles.section, { marginTop: 12 }]}>
        <Text style={styles.sectionTitle}>Ingredients</Text>
        <Text style={styles.bodyText}>
          {item.ingredients || (isEnrichmentPending ? 'Fetching product details…' : 'Ingredients not available.')}
        </Text>
</View>
<View style={[styles.section, { marginTop: 12 }]}>
        <Text style={styles.sectionTitle}>Details</Text>
        <Text style={styles.muted}>
          {typeof item.polyunsaturatedFatPer100g === 'number'
            ? `Polyunsaturated fat: ${item.polyunsaturatedFatPer100g.toFixed(1)} g / 100 g`
            : 'Polyunsaturated fat: not available'}
        </Text>
        {item.matchedSeedOils && item.matchedSeedOils.length > 0 ? (
          <Text style={styles.muted}>Seed oils: {item.matchedSeedOils.join(', ')}</Text>
        ) : null}
        {isEnrichmentPending ? (
          <Text style={styles.muted}>Looking up product in OpenFoodFacts…</Text>
        ) : null}
</View>
</View>
</View>
);
}

function HistoryScreen({
loading,
items,
onOpen,
onToggleFavorite,
}: {
loading: boolean;
items: HistoryItem[];
onOpen: (item: HistoryItem) => void;
onToggleFavorite: (id: string) => void;
}) {
if (loading) {
return (
<View style={[styles.screen, styles.center]}>
<ActivityIndicator />
<Text style={styles.muted}>Loading history…</Text>
</View>
);
}

if (items.length === 0) {
return (
<View style={[styles.screen, styles.center]}>
<Text style={styles.subtitle}>No history yet</Text>
<Text style={styles.muted}>Scans will appear here for quick review and favorites.</Text>
</View>
);
}

return (
<View style={styles.screen}>
<FlatList
data={items}
keyExtractor={(it) => it.id}
contentContainerStyle={{ paddingBottom: 16 }}
renderItem={({ item }) => (
<TouchableOpacity onPress={() => onOpen(item)} style={styles.row}>
<View style={styles.rowCol}>
<Text style={styles.rowTitle}>{item.name || item.barcodeData || 'Unknown item'}</Text>
<Text style={styles.rowMeta}>{new Date(item.scannedAt).toLocaleString()}</Text>
</View>
<View style={{ alignItems: 'flex-end' }}>
<Badge flag={item.pufaFlag || 'unknown'} />
<TouchableOpacity onPress={() => onToggleFavorite(item.id)} style={{ marginTop: 6 }}>
{item.isFavorite ? <Star size={18} color={ACCENT} /> : <StarOff size={18} color={MUTED} />}
</TouchableOpacity>
</View>
</TouchableOpacity>
)}
/>
</View>
);
}

function SettingsScreen() {
return (
<View style={styles.screen}>
<View style={styles.card}>
<Text style={styles.title}>Settings</Text>
<Text style={styles.bodyText}>• Appearance follows system dark/light.</Text>
<Text style={styles.bodyText}>• Haptics enabled for scan success.</Text>
<Text style={styles.bodyText}>• Data stored locally with AsyncStorage.</Text>
<Text style={[styles.muted, { marginTop: 8 }]}>
Future: PUFA thresholds, offline cache, API source selection, export.
</Text>
</View>
</View>
);
}

function TabBar({ tab, onChange, disabled }: { tab: TabKey; onChange: (t: TabKey) => void; disabled?: boolean }) {
return (
<View style={[styles.tabbar, disabled && { opacity: 0.4 }]}>
<TabBtn label="Home" active={tab === 'Home'} onPress={() => !disabled && onChange('Home')} icon={<HomeIcon size={18} color={tab === 'Home' ? '#00150F' : TEXT} />} />
<TabBtn label="History" active={tab === 'History'} onPress={() => !disabled && onChange('History')} icon={<HistoryIcon size={18} color={tab === 'History' ? '#00150F' : TEXT} />} />
<TabBtn label="Settings" active={tab === 'Settings'} onPress={() => !disabled && onChange('Settings')} icon={<SettingsIcon size={18} color={tab === 'Settings' ? '#00150F' : TEXT} />} />
</View>
);
}

function TabBtn({ label, active, onPress, icon }: { label: string; active: boolean; onPress: () => void; icon: React.ReactNode }) {
return (
<TouchableOpacity onPress={onPress} style={[styles.tabBtn, active && { backgroundColor: ACCENT }]}>
<View style={{ marginBottom: 2 }}>{icon}</View>
<Text style={[styles.tabLabel, active && { color: '#00150F', fontWeight: '700' }]}>{label}</Text>
</TouchableOpacity>
);
}

function Badge({ flag }: { flag: NonNullable<HistoryItem['pufaFlag']> }) {
const { text, tone } = useMemo(() => {
switch (flag) {
case 'low': return { text: 'LOW', tone: '#2BD671' };
case 'medium': return { text: 'MED', tone: '#F2C14E' };
case 'high': return { text: 'HIGH', tone: '#FF6B6B' };
default: return { text: 'TBD', tone: MUTED };
}
}, [flag]);
return (
<View style={{ backgroundColor: BG_ELEV, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 4, borderWidth: 1, borderColor: tone }}>
<Text style={{ color: tone, fontSize: 12, fontWeight: '700', letterSpacing: 0.5 }}>{text}</Text>
</View>
);
}

const styles = StyleSheet.create({
safe: { flex: 1, backgroundColor: BG },
container: { flex: 1, backgroundColor: BG },
header: {
height: 52,
flexDirection: 'row',
alignItems: 'center',
paddingHorizontal: 12,
borderBottomWidth: StyleSheet.hairlineWidth,
borderBottomColor: '#1C2327',
backgroundColor: BG_ELEV,
},
backBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
backBtnPlaceholder: { width: 44, height: 44 },
headerTitle: { flex: 1, textAlign: 'center', color: TEXT, fontSize: 18, fontWeight: '700' },
screen: { flex: 1, padding: 16, gap: 16 },
center: { alignItems: 'center', justifyContent: 'center' },
card: { backgroundColor: BG_ELEV, borderRadius: 16, padding: 16, gap: 8, borderWidth: 1, borderColor: '#1C2327' },
title: { color: TEXT, fontSize: 20, fontWeight: '800' },
subtitle: { color: TEXT, opacity: 0.85, fontSize: 14, lineHeight: 20 },
bodyText: { color: TEXT, fontSize: 14, lineHeight: 20 },
primaryBtn: { marginTop: 10, backgroundColor: ACCENT, borderRadius: 12, paddingVertical: 14, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8 },
primaryBtnText: { color: '#00150F', fontWeight: '800', fontSize: 16 },
section: { gap: 8 },
sectionTitle: { color: TEXT, fontWeight: '700', fontSize: 16 },
muted: { color: MUTED },
row: { backgroundColor: BG_ELEV, borderRadius: 12, padding: 12, marginBottom: 8, borderWidth: 1, borderColor: '#1C2327', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
rowCol: { flex: 1 },
rowTitle: { color: TEXT, fontWeight: '600' },
rowMeta: { color: MUTED, fontSize: 12, marginTop: 2 },
tabbar: { flexDirection: 'row', padding: 8, gap: 8, backgroundColor: BG_ELEV, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#1C2327' },
tabBtn: { flex: 1, borderRadius: 12, paddingVertical: 8, alignItems: 'center', gap: 2, borderWidth: 1, borderColor: '#1C2327' },
tabLabel: { color: TEXT, fontSize: 12, fontWeight: '600' },
scanOverlay: { position: 'absolute', bottom: 0, left: 0, right: 0, padding: 12, backgroundColor: 'rgba(0,0,0,0.35)' },
scanHint: { color: TEXT, textAlign: 'center' }
});