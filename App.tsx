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
const HTTP_HEADERS = {
  Accept: 'application/json',
  'Accept-Language': 'en',
  'User-Agent': 'PUFA-Check/0.1 (+https://example.com)'
};

type TabKey = 'Home' | 'History' | 'Settings';
type StackKey = 'Root' | 'Scan' | 'Result';

type UnitValue = { value?: number; unit?: string };
function formatNutri(n: UnitValue | undefined, label: string): string {
  if (!n || (n.value == null && !n.unit)) return `${label}: not available`;
  const value = n.value != null ? (Number.isFinite(n.value) ? (n.value as number).toFixed(1) : String(n.value)) : '—';
  return `${label}: ${value}${n.unit ? ' ' + n.unit : ''}`;
}

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
  nutriments?: {
    energyKcal?: UnitValue;
    fat?: UnitValue;
    saturatedFat?: UnitValue;
    monounsaturatedFat?: UnitValue;
    polyunsaturatedFat?: UnitValue;
    transFat?: UnitValue;
    carbohydrates?: UnitValue;
    sugars?: UnitValue;
    fiber?: UnitValue;
    proteins?: UnitValue;
    salt?: UnitValue;
    sodium?: UnitValue;
    vitaminA?: UnitValue;
    vitaminC?: UnitValue;
    vitaminD?: UnitValue;
    vitaminE?: UnitValue;
    vitaminK?: UnitValue;
    vitaminB1?: UnitValue;
    vitaminB2?: UnitValue;
    vitaminB3?: UnitValue;
    vitaminB6?: UnitValue;
    vitaminB12?: UnitValue;
    calcium?: UnitValue;
    iron?: UnitValue;
    potassium?: UnitValue;
    magnesium?: UnitValue;
    zinc?: UnitValue;
  };
  lookupStatus?: 'pending' | 'found' | 'not_found' | 'error';
  lookupSource?: string;
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
      await update(item.id, { lookupStatus: 'pending' });

      const endpoints = [
        { url: (code: string) => `https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(code)}.json`, parser: parseOffV2, source: 'OFF v2 world' },
        { url: (code: string) => `https://us.openfoodfacts.org/api/v2/product/${encodeURIComponent(code)}.json`, parser: parseOffV2, source: 'OFF v2 us' },
        { url: (code: string) => `https://world.openfoodfacts.org/api/v0/product/${encodeURIComponent(code)}.json`, parser: parseOffV0, source: 'OFF v0 world' },
        { url: (code: string) => `https://us.openfoodfacts.org/api/v0/product/${encodeURIComponent(code)}.json`, parser: parseOffV0, source: 'OFF v0 us' },
      ] as const;

      let productData: ReturnType<typeof parseOffV2> | undefined;
      let sourceUsed: string | undefined;
      // helper fetch with timeout
      const fetchJsonWithTimeout = async (url: string, ms = 6000) => {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), ms);
        try {
          const res = await fetch(url, { headers: HTTP_HEADERS, signal: controller.signal as any });
          return await res.json();
        } finally {
          clearTimeout(timeoutId);
        }
      };

      for (const ep of endpoints) {
        try {
          const json = await fetchJsonWithTimeout(ep.url(item.barcodeData));
          const parsed = ep.parser(json);
          if (parsed) {
            productData = parsed;
            sourceUsed = ep.source;
            break;
          }
        } catch {}
      }

      if (!productData) {
        const notFound = await update(item.id, { lookupStatus: 'not_found' });
        if (notFound && result && result.id === item.id) setResult(notFound);
        return notFound;
      }

      const name: string | undefined = productData.name;
      const ingredientsText: string | undefined = productData.ingredientsText;
      const polyFat: number | undefined = productData.polyFatPer100g;

      const analysis = analyzePufa(ingredientsText, polyFat);

      const updated: Partial<HistoryItem> = {
        name: name || item.name,
        ingredients: ingredientsText || item.ingredients,
        polyunsaturatedFatPer100g: typeof polyFat === 'number' ? polyFat : item.polyunsaturatedFatPer100g,
        pufaFlag: analysis.flag,
        matchedSeedOils: analysis.matchedSeedOils,
        lookupStatus: 'found',
        lookupSource: sourceUsed,
        nutriments: productData.nutriments || item.nutriments,
      };
      const newItem = await update(item.id, updated);
      if (newItem && result && result.id === item.id) setResult(newItem);
      return newItem;
    } catch (e) {
      console.warn('OpenFoodFacts lookup failed', e);
      const errored = await update(item.id, { lookupStatus: 'error' });
      if (errored && result && result.id === item.id) setResult(errored);
      return errored;
    }
  }, [result, update]);

  function parseOffV2(json: any): { name?: string; ingredientsText?: string; polyFatPer100g?: number; nutriments?: HistoryItem['nutriments'] } | undefined {
    const status = json?.status;
    if (status === 0) return undefined;
    const product = json?.product;
    if (!product) return undefined;
    const name: string | undefined = product.product_name;
    const ingredientsText: string | undefined = product.ingredients_text_en || product.ingredients_text;
    const nutriments = mapBasicNutriments(product?.nutriments);
    const polyFatPer100g: number | undefined = product?.nutriments?.['polyunsaturated-fat_100g'];
    const hasData = !!(name || ingredientsText || (nutriments && Object.keys(nutriments).length > 0));
    if (!hasData) return undefined;
    return { name, ingredientsText, polyFatPer100g, nutriments };
  }

  function parseOffV0(json: any): { name?: string; ingredientsText?: string; polyFatPer100g?: number; nutriments?: HistoryItem['nutriments'] } | undefined {
    const status = json?.status;
    const product = json?.product;
    if (!product || status !== 1) return undefined;
    const name: string | undefined = product.product_name;
    const ingredientsText: string | undefined = product.ingredients_text_en || product.ingredients_text;
    const nutriments = mapBasicNutriments(product?.nutriments);
    const polyFatPer100g: number | undefined = product?.nutriments?.['polyunsaturated-fat_100g'];
    const hasData = !!(name || ingredientsText || (nutriments && Object.keys(nutriments).length > 0));
    if (!hasData) return undefined;
    return { name, ingredientsText, polyFatPer100g, nutriments };
  }

  function mapBasicNutriments(off: any | undefined): HistoryItem['nutriments'] | undefined {
    if (!off) return undefined;
    const pick = (key: string): { value?: number; unit?: string } | undefined => {
      const value = typeof off?.[`${key}_100g`] === 'number' ? off?.[`${key}_100g`] : undefined;
      const unit = typeof off?.[`${key}_unit`] === 'string' ? off?.[`${key}_unit`] : undefined;
      if (value == null && unit == null) return undefined;
      return { value, unit };
    };
    const energyKcal = (() => {
      const kcal = typeof off?.['energy-kcal_100g'] === 'number' ? off?.['energy-kcal_100g'] : undefined;
      const kj = typeof off?.['energy-kj_100g'] === 'number' ? off?.['energy-kj_100g'] : undefined;
      const value = kcal != null ? kcal : (kj != null ? (kj / 4.184) : undefined);
      if (value == null) return undefined;
      return { value, unit: 'kcal' };
    })();
    return {
      energyKcal,
      fat: pick('fat'),
      saturatedFat: pick('saturated-fat'),
      monounsaturatedFat: pick('monounsaturated-fat'),
      polyunsaturatedFat: pick('polyunsaturated-fat'),
      transFat: pick('trans-fat'),
      carbohydrates: pick('carbohydrates'),
      sugars: pick('sugars'),
      fiber: pick('fiber'),
      proteins: pick('proteins'),
      salt: pick('salt'),
      sodium: pick('sodium'),
    };
  }

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

  function formatNutri(n: HistoryItem['nutriments'] extends infer T ? T extends object ? any : any : any, label: string): string {
    if (!n || (n.value == null && !n.unit)) return `${label}: not available`;
    const value = n.value != null ? (Number.isFinite(n.value) ? n.value.toFixed(1) : String(n.value)) : '—';
    return `${label}: ${value}${n.unit ? ' ' + n.unit : ''}`;
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
            lookupStatus: 'pending',
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
  <Text style={styles.sectionTitle}>Macronutrients (per 100 g)</Text>
  <Text style={styles.muted}>
    {formatNutri(item.nutriments?.energyKcal, 'Energy')}
  </Text>
  <Text style={styles.muted}>{formatNutri(item.nutriments?.fat, 'Fat')}</Text>
  <Text style={styles.muted}>{formatNutri(item.nutriments?.saturatedFat, 'Saturated fat')}</Text>
  <Text style={styles.muted}>{formatNutri(item.nutriments?.monounsaturatedFat, 'Monounsaturated fat')}</Text>
  <Text style={styles.muted}>{formatNutri(item.nutriments?.polyunsaturatedFat, 'Polyunsaturated fat')}</Text>
  <Text style={styles.muted}>{formatNutri(item.nutriments?.transFat, 'Trans fat')}</Text>
  <Text style={styles.muted}>{formatNutri(item.nutriments?.carbohydrates, 'Carbohydrates')}</Text>
  <Text style={styles.muted}>{formatNutri(item.nutriments?.sugars, 'Sugars')}</Text>
  <Text style={styles.muted}>{formatNutri(item.nutriments?.fiber, 'Fiber')}</Text>
  <Text style={styles.muted}>{formatNutri(item.nutriments?.proteins, 'Protein')}</Text>
</View>

<View style={[styles.section, { marginTop: 12 }]}>
  <Text style={styles.sectionTitle}>Sodium</Text>
  <Text style={styles.muted}>{formatNutri(item.nutriments?.salt, 'Salt')}</Text>
  <Text style={styles.muted}>{formatNutri(item.nutriments?.sodium, 'Sodium')}</Text>
</View>

{item.matchedSeedOils && item.matchedSeedOils.length > 0 ? (
  <View style={[styles.section, { marginTop: 12 }]}>
    <Text style={styles.sectionTitle}>Seed oils detected</Text>
    <Text style={styles.muted}>{item.matchedSeedOils.join(', ')}</Text>
  </View>
) : null}

{isEnrichmentPending ? (
  <View style={[styles.section, { marginTop: 12 }]}>
    <Text style={styles.muted}>Looking up product in OpenFoodFacts…</Text>
  </View>
) : null}
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