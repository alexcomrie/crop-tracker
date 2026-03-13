import React, { useState, useEffect } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity,
  StyleSheet, Platform, ActivityIndicator, Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { useApp } from '@/context/AppContext';
import { FormField } from '@/components/FormField';
import Colors from '@/constants/colors';

const C = Colors.light;

export default function SettingsScreen() {
  const insets = useSafeAreaInsets();
  const { settings, updateSettings, pull, isSyncing, syncMessage } = useApp();
  const [form, setForm] = useState({
    cropsSheetUrl: '',
    propagationsSheetUrl: '',
    remindersSheetUrl: '',
    stageLogsSheetUrl: '',
    harvestLogsSheetUrl: '',
    treatmentLogsSheetUrl: '',
    telegramChatId: '',
    weatherLocation: "Saint Ann's Bay",
    weatherLat: '18.4358',
    weatherLon: '-77.2010',
    rainThresholdMm: '5',
  });
  const [saved, setSaved] = useState(false);
  const [sheetsExpanded, setSheetsExpanded] = useState(false);

  const topPad = Platform.OS === 'web' ? 67 : insets.top;

  useEffect(() => {
    if (settings) {
      setForm({
        cropsSheetUrl: settings.cropsSheetUrl || '',
        propagationsSheetUrl: settings.propagationsSheetUrl || '',
        remindersSheetUrl: settings.remindersSheetUrl || '',
        stageLogsSheetUrl: settings.stageLogsSheetUrl || '',
        harvestLogsSheetUrl: settings.harvestLogsSheetUrl || '',
        treatmentLogsSheetUrl: settings.treatmentLogsSheetUrl || '',
        telegramChatId: settings.telegramChatId || '',
        weatherLocation: settings.weatherLocation || "Saint Ann's Bay",
        weatherLat: String(settings.weatherLat || 18.4358),
        weatherLon: String(settings.weatherLon || -77.2010),
        rainThresholdMm: String(settings.rainThresholdMm || 5),
      });
    }
  }, [settings]);

  const handleSave = async () => {
    await updateSettings({
      cropsSheetUrl: form.cropsSheetUrl,
      propagationsSheetUrl: form.propagationsSheetUrl,
      remindersSheetUrl: form.remindersSheetUrl,
      stageLogsSheetUrl: form.stageLogsSheetUrl,
      harvestLogsSheetUrl: form.harvestLogsSheetUrl,
      treatmentLogsSheetUrl: form.treatmentLogsSheetUrl,
      telegramChatId: form.telegramChatId,
      weatherLocation: form.weatherLocation,
      weatherLat: parseFloat(form.weatherLat) || 18.4358,
      weatherLon: parseFloat(form.weatherLon) || -77.2010,
      rainThresholdMm: parseFloat(form.rainThresholdMm) || 5,
    });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const handlePull = () => {
    const hasAny = form.cropsSheetUrl || form.propagationsSheetUrl || form.remindersSheetUrl ||
      form.stageLogsSheetUrl || form.harvestLogsSheetUrl || form.treatmentLogsSheetUrl;
    if (!hasAny) {
      Alert.alert(
        'No URLs configured',
        'Add at least one published Google Sheet CSV URL in the Sheets section, then save before importing.',
        [{ text: 'OK' }]
      );
      return;
    }
    Alert.alert(
      'Import from Sheets',
      'This will overwrite local data with data from your published Google Sheets. Continue?',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Import', style: 'destructive', onPress: pull },
      ]
    );
  };

  const f = (key: keyof typeof form) => (v: string) => setForm(prev => ({ ...prev, [key]: v }));

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={[styles.content, { paddingTop: topPad + 16, paddingBottom: Platform.OS === 'web' ? 34 + 84 : 100 }]}
      showsVerticalScrollIndicator={false}
    >
      <Text style={styles.title}>Settings</Text>

      {syncMessage ? (
        <View style={[styles.messageBanner, syncMessage.toLowerCase().includes('fail') || syncMessage.toLowerCase().includes('error') ? styles.messageBannerError : null]}>
          <Feather name={syncMessage.toLowerCase().includes('fail') ? 'alert-circle' : 'check-circle'} size={14} color={syncMessage.toLowerCase().includes('fail') ? '#DC2626' : C.tint} />
          <Text style={[styles.messageText, syncMessage.toLowerCase().includes('fail') ? styles.messageTextError : null]}>{syncMessage}</Text>
        </View>
      ) : null}

      {/* Google Sheets Import */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Feather name="download-cloud" size={16} color={C.tint} />
          <Text style={styles.sectionTitle}>Google Sheets Import</Text>
        </View>

        <View style={styles.infoBox}>
          <Feather name="info" size={13} color="#6B7280" />
          <Text style={styles.infoText}>
            Publish each sheet tab via{' '}
            <Text style={styles.infoCode}>File › Share › Publish to web</Text>
            , choose CSV format, and paste the URL below. Leave blank to skip that table.
          </Text>
        </View>

        <FormField
          label="Crops Sheet URL"
          value={form.cropsSheetUrl}
          onChangeText={f('cropsSheetUrl')}
          placeholder="https://docs.google.com/spreadsheets/d/e/.../pub?output=csv"
          autoCapitalize="none"
          keyboardType="url"
        />

        <TouchableOpacity style={styles.expandToggle} onPress={() => setSheetsExpanded(e => !e)} activeOpacity={0.7}>
          <Text style={styles.expandText}>{sheetsExpanded ? 'Hide additional sheets' : 'Show additional sheet URLs'}</Text>
          <Feather name={sheetsExpanded ? 'chevron-up' : 'chevron-down'} size={14} color={C.tint} />
        </TouchableOpacity>

        {sheetsExpanded && (
          <>
            <FormField
              label="Propagations Sheet URL"
              value={form.propagationsSheetUrl}
              onChangeText={f('propagationsSheetUrl')}
              placeholder="https://docs.google.com/spreadsheets/d/e/.../pub?output=csv&gid=..."
              autoCapitalize="none"
              keyboardType="url"
            />
            <FormField
              label="Reminders Sheet URL"
              value={form.remindersSheetUrl}
              onChangeText={f('remindersSheetUrl')}
              placeholder="https://docs.google.com/spreadsheets/d/e/.../pub?output=csv&gid=..."
              autoCapitalize="none"
              keyboardType="url"
            />
            <FormField
              label="Stage Logs Sheet URL"
              value={form.stageLogsSheetUrl}
              onChangeText={f('stageLogsSheetUrl')}
              placeholder="https://docs.google.com/spreadsheets/d/e/.../pub?output=csv&gid=..."
              autoCapitalize="none"
              keyboardType="url"
            />
            <FormField
              label="Harvest Logs Sheet URL"
              value={form.harvestLogsSheetUrl}
              onChangeText={f('harvestLogsSheetUrl')}
              placeholder="https://docs.google.com/spreadsheets/d/e/.../pub?output=csv&gid=..."
              autoCapitalize="none"
              keyboardType="url"
            />
            <FormField
              label="Treatment Logs Sheet URL"
              value={form.treatmentLogsSheetUrl}
              onChangeText={f('treatmentLogsSheetUrl')}
              placeholder="https://docs.google.com/spreadsheets/d/e/.../pub?output=csv&gid=..."
              autoCapitalize="none"
              keyboardType="url"
            />
          </>
        )}

        <TouchableOpacity
          style={[styles.pullBtn, isSyncing && styles.btnDisabled]}
          onPress={handlePull}
          disabled={isSyncing}
          activeOpacity={0.8}
        >
          {isSyncing ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Feather name="download-cloud" size={16} color="#fff" />
          )}
          <Text style={styles.pullBtnText}>{isSyncing ? 'Importing...' : 'Import from Sheets'}</Text>
        </TouchableOpacity>

        {settings?.lastSyncAt ? (
          <Text style={styles.lastSync}>
            Last import: {new Date(settings.lastSyncAt).toLocaleString()}
          </Text>
        ) : null}
      </View>

      {/* Telegram */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Feather name="message-circle" size={16} color={C.tint} />
          <Text style={styles.sectionTitle}>Telegram</Text>
        </View>
        <FormField
          label="Telegram Chat ID"
          value={form.telegramChatId}
          onChangeText={f('telegramChatId')}
          placeholder="5837914224"
          keyboardType="numeric"
        />
      </View>

      {/* Weather */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Feather name="cloud-rain" size={16} color={C.tint} />
          <Text style={styles.sectionTitle}>Weather</Text>
        </View>
        <FormField
          label="Location Name"
          value={form.weatherLocation}
          onChangeText={f('weatherLocation')}
          placeholder="Saint Ann's Bay"
        />
        <View style={styles.row}>
          <View style={styles.halfField}>
            <FormField
              label="Latitude"
              value={form.weatherLat}
              onChangeText={f('weatherLat')}
              placeholder="18.4358"
              keyboardType="numeric"
            />
          </View>
          <View style={styles.halfField}>
            <FormField
              label="Longitude"
              value={form.weatherLon}
              onChangeText={f('weatherLon')}
              placeholder="-77.2010"
              keyboardType="numeric"
            />
          </View>
        </View>
        <FormField
          label="Rain Threshold (mm)"
          value={form.rainThresholdMm}
          onChangeText={f('rainThresholdMm')}
          placeholder="5"
          keyboardType="numeric"
          hint="Spraying is not recommended when rain exceeds this amount"
        />
      </View>

      {/* Save */}
      <TouchableOpacity style={[styles.saveBtn, saved && styles.saveBtnDone]} onPress={handleSave} activeOpacity={0.8}>
        <Feather name={saved ? 'check' : 'save'} size={18} color="#fff" />
        <Text style={styles.saveBtnText}>{saved ? 'Saved!' : 'Save Settings'}</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.background },
  content: { paddingHorizontal: 16 },
  title: { fontSize: 26, fontFamily: 'Inter_700Bold', color: C.text, marginBottom: 20 },
  messageBanner: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 8,
    backgroundColor: '#E8F5EE', borderRadius: 12, padding: 12, marginBottom: 16,
    borderWidth: 1, borderColor: C.tint + '33',
  },
  messageBannerError: { backgroundColor: '#FEF2F2', borderColor: '#FCA5A5' },
  messageText: { fontSize: 13, fontFamily: 'Inter_500Medium', color: C.tint, flex: 1 },
  messageTextError: { color: '#DC2626' },
  section: {
    backgroundColor: C.card, borderRadius: 16, padding: 16,
    marginBottom: 16, borderWidth: 1, borderColor: C.cardBorder,
  },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
  sectionTitle: { fontSize: 15, fontFamily: 'Inter_600SemiBold', color: C.text },
  infoBox: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 8,
    backgroundColor: '#F9FAFB', borderRadius: 10, padding: 10, marginBottom: 14,
    borderWidth: 1, borderColor: '#E5E7EB',
  },
  infoText: { flex: 1, fontSize: 12, fontFamily: 'Inter_400Regular', color: '#6B7280', lineHeight: 18 },
  infoCode: { fontFamily: 'Inter_500Medium', color: '#374151' },
  expandToggle: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingVertical: 8, marginBottom: 4,
  },
  expandText: { fontSize: 13, fontFamily: 'Inter_500Medium', color: C.tint },
  pullBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    backgroundColor: C.tint, borderRadius: 12, paddingVertical: 13, gap: 8, marginTop: 8,
  },
  btnDisabled: { opacity: 0.5 },
  pullBtnText: { color: '#fff', fontFamily: 'Inter_600SemiBold', fontSize: 14 },
  lastSync: { fontSize: 11, fontFamily: 'Inter_400Regular', color: C.textMuted, marginTop: 8, textAlign: 'center' },
  row: { flexDirection: 'row', gap: 10 },
  halfField: { flex: 1 },
  saveBtn: {
    backgroundColor: C.tint, borderRadius: 16, paddingVertical: 16,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10,
  },
  saveBtnDone: { backgroundColor: '#10B981' },
  saveBtnText: { color: '#fff', fontFamily: 'Inter_700Bold', fontSize: 16 },
});
