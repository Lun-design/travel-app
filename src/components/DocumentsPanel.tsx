import React, { useEffect, useState } from 'react'; import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'; import { deleteDocument, getDocumentPreviewUrl, listDocuments } from '@/lib/documents-api'; import type { TravelDocument } from '@/lib/documents'; import { DocumentUploadModal } from './DocumentUploadModal'; import { DocumentPreviewModal } from './DocumentPreviewModal'; import { EDITORIAL_COLORS } from '@/lib/theme';
export function DocumentsPanel({ tripId, userId }: { tripId: string; userId: string }) { const [documents, setDocuments] = useState<TravelDocument[]>([]); const [uploading, setUploading] = useState(false); const [preview, setPreview] = useState<TravelDocument | null>(null); const [url, setUrl] = useState<string | null>(null); async function load() { try { setDocuments(await listDocuments(tripId)); } catch (error: any) { Alert.alert('載入憑證失敗', error?.message ?? '請稍後再試。'); } } useEffect(() => { load(); }, [tripId]); async function open(document: TravelDocument) { setPreview(document); setUrl(null); try { setUrl(await getDocumentPreviewUrl(document)); } catch (error: any) { Alert.alert('預覽失敗', error?.message ?? '無法產生預覽連結。'); setPreview(null); } }
  return <ScrollView contentContainerStyle={styles.container}><View style={styles.header}><View style={styles.headerCopy}><Text style={styles.title}>旅遊憑證</Text><Text style={styles.subtitle}>集中保存機票、住宿與保險文件</Text></View><Pressable style={styles.upload} onPress={() => setUploading(true)}><Text style={styles.white}>＋ 上傳</Text></Pressable></View>{documents.length ? documents.map((document) => <View key={document.id} style={styles.card}><Pressable style={styles.info} onPress={() => open(document)}><Text style={styles.icon}>{document.file_type === 'application/pdf' ? '📄' : '🖼️'}</Text><View style={styles.content}><Text numberOfLines={2} style={styles.name}>{document.name}</Text><Text numberOfLines={2} style={styles.type}>{document.file_type}</Text></View></Pressable><Pressable style={styles.deleteButton} onPress={() => Alert.alert('刪除憑證', `確定刪除「${document.name}」？`, [{ text: '取消' }, { text: '刪除', style: 'destructive', onPress: async () => { try { await deleteDocument(document); await load(); } catch (error: any) { Alert.alert('刪除失敗', error?.message); } } }])}><Text style={styles.delete}>刪除</Text></Pressable></View>) : <View style={styles.empty}><Text style={styles.emptyIcon}>🗂️</Text><Text style={styles.subtitle}>目前還沒有憑證</Text></View>}<DocumentUploadModal visible={uploading} tripId={tripId} userId={userId} onClose={() => setUploading(false)} onUploaded={load} /><DocumentPreviewModal document={preview} url={url} onClose={() => { setPreview(null); setUrl(null); }} /></ScrollView>;
}
const styles = StyleSheet.create({
  container: { width: '100%', maxWidth: '100%', boxSizing: 'border-box', padding: 4, paddingBottom: 100, gap: 10 },
  header: { width: '100%', maxWidth: '100%', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10, marginBottom: 8 },
  headerCopy: { flex: 1, minWidth: 0 },
  title: { fontSize: 21, fontWeight: '800' },
  subtitle: { color: EDITORIAL_COLORS.taupe, marginTop: 3 },
  upload: { flexShrink: 0, minHeight: 44, justifyContent: 'center', backgroundColor: EDITORIAL_COLORS.terracotta, borderRadius: 10, paddingHorizontal: 13, paddingVertical: 10 },
  white: { color: EDITORIAL_COLORS.paper, fontWeight: '800' },
  card: { width: '100%', maxWidth: '100%', overflow: 'hidden', boxSizing: 'border-box', flexDirection: 'row', alignItems: 'center', backgroundColor: EDITORIAL_COLORS.paper, borderRadius: 14, padding: 12, borderWidth: 1, borderColor: EDITORIAL_COLORS.line },
  info: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 10 },
  icon: { fontSize: 26 },
  content: { flex: 1, minWidth: 0 },
  name: { fontSize: 16, fontWeight: '800' },
  type: { color: EDITORIAL_COLORS.taupe, fontSize: 12, marginTop: 3 },
  deleteButton: { flexShrink: 0, marginLeft: 8 },
  delete: { color: EDITORIAL_COLORS.dangerText, fontSize: 13, fontWeight: '700', minHeight: 44, paddingVertical: 12 },
  empty: { width: '100%', maxWidth: '100%', boxSizing: 'border-box', alignItems: 'center', padding: 45, gap: 8 },
  emptyIcon: { fontSize: 36 },
});
