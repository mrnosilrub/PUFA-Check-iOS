import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, SafeAreaView, Button } from 'react-native';
import { Camera, CameraType } from 'expo-camera';
import * as Haptics from 'expo-haptics';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Home, Camera as CameraIcon, Clock, Settings } from 'lucide-react-native';

type Tab = 'Home' | 'Scan' | 'History' | 'Settings';

export default function App() {
  const [tab, setTab] = useState<Tab>('Home');
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#1A1A1A' }}>
      <View style={{ flex: 1 }}>
        {tab === 'Home' && <HomeScreen onScan={() => setTab('Scan')} />}
        {tab === 'Scan' && <ScanScreen onClose={() => setTab('Home')} />}
        {tab === 'History' && <HistoryScreen />}
        {tab === 'Settings' && <SettingsScreen />}
      </View>
      <View style={styles.nav}>
        <NavButton label="Home" Icon={Home} active={tab === 'Home'} onPress={() => setTab('Home')} />
        <NavButton label="Scan" Icon={CameraIcon} active={tab === 'Scan'} onPress={() => setTab('Scan')} />
        <NavButton label="History" Icon={Clock} active={tab === 'History'} onPress={() => setTab('History')} />
        <NavButton label="Settings" Icon={Settings} active={tab === 'Settings'} onPress={() => setTab('Settings')} />
      </View>
    </SafeAreaView>
  );
}

function NavButton({ label, Icon, active, onPress }: any) {
  const color = active ? '#24D3A8' : '#888';
  return (
    <TouchableOpacity style={styles.navButton} onPress={onPress}>
      <Icon color={color} size={24} />
      <Text style={{ color, fontSize: 12 }}>{label}</Text>
    </TouchableOpacity>
  );
}

function HomeScreen({ onScan }: { onScan: () => void }) {
  return (
    <View style={styles.center}>
      <Text style={styles.title}>PUFA Check</Text>
      <Text style={styles.subtitle}>Scan foods to identify seed oils and high‑PUFA content.</Text>
      <TouchableOpacity style={styles.scanButton} onPress={onScan}>
        <Text style={styles.scanButtonText}>Start Scan</Text>
      </TouchableOpacity>
    </View>
  );
}

function ScanScreen({ onClose }: { onClose: () => void }) {
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  const [scanned, setScanned] = useState(false);
  const [code, setCode] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const { status } = await Camera.requestCameraPermissionsAsync();
      setHasPermission(status === 'granted');
    })();
  }, []);

  const handleBarCodeScanned = ({ data }: { data: string }) => {
    setScanned(true);
    setCode(data);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    saveToHistory(data);
  };

  const saveToHistory = async (data: string) => {
    try {
      const existing = await AsyncStorage.getItem('history');
      const history = existing ? JSON.parse(existing) : [];
      history.unshift({ code: data, date: new Date().toISOString() });
      await AsyncStorage.setItem('history', JSON.stringify(history));
    } catch (e) {
      console.warn(e);
    }
  };

  if (hasPermission === null) {
    return (
      <View style={styles.center}>
        <Text style={{ color: '#fff' }}>Requesting camera permission…</Text>
      </View>
    );
  }
  if (hasPermission === false) {
    return (
      <View style={styles.center}>
        <Text style={{ color: '#fff' }}>No access to camera</Text>
        <Button title="Close" onPress={onClose} />
      </View>
    );
  }
  return (
    <View style={{ flex: 1 }}>
      <Camera
        style={{ flex: 1 }}
        type={CameraType.back}
        onBarCodeScanned={scanned ? undefined : handleBarCodeScanned}
      />
      <View style={styles.scanOverlay}>
        {scanned && (
          <View style={styles.result}>
            <Text style={styles.resultText}>Scanned: {code}</Text>
            <Button title="Scan Again" onPress={() => { setScanned(false); setCode(null); }} />
            <Button title="Done" onPress={onClose} />
          </View>
        )}
      </View>
    </View>
  );
}

function HistoryScreen() {
  const [history, setHistory] = useState<{ code: string; date: string }[]>([]);
  useEffect(() => {
    const load = async () => {
      const data = await AsyncStorage.getItem('history');
      if (data) setHistory(JSON.parse(data));
    };
    load();
  }, []);
  return (
    <View style={styles.center}>
      <Text style={styles.title}>History</Text>
      {history.length === 0 ? (
        <Text style={{ color: '#888' }}>No scans yet.</Text>
      ) : (
        history.map((item, idx) => (
          <Text key={idx} style={{ color: '#fff' }}>
            {item.code} – {new Date(item.date).toLocaleString()}
          </Text>
        ))
      )}
    </View>
  );
}

function SettingsScreen() {
  return (
    <View style={styles.center}>
      <Text style={styles.title}>Settings</Text>
      <Text style={{ color: '#888' }}>Coming soon.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20
  },
  title: {
    color: '#24D3A8',
    fontSize: 28,
    fontWeight: 'bold',
    marginBottom: 10
  },
  subtitle: {
    color: '#ccc',
    fontSize: 16,
    textAlign: 'center',
    marginBottom: 20
  },
  scanButton: {
    backgroundColor: '#24D3A8',
    paddingHorizontal: 30,
    paddingVertical: 12,
    borderRadius: 8
  },
  scanButtonText: {
    color: '#1A1A1A',
    fontSize: 16,
    fontWeight: 'bold'
  },
  nav: {
    flexDirection: 'row',
    backgroundColor: '#222',
    borderTopWidth: 1,
    borderTopColor: '#333'
  },
  navButton: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 10
  },
  scanOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: 20,
    alignItems: 'center'
  },
  result: {
    backgroundColor: '#000000AA',
    padding: 15,
    borderRadius: 8
  },
  resultText: {
    color: '#24D3A8',
    fontSize: 18,
    marginBottom: 10
  }
});
