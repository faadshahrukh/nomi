import { Platform } from 'react-native';

export type ShareResult = 'shared' | 'unavailable';

/**
 * Hands a text file to the user: a browser download on web, the system share sheet on a phone (save to Files, send, and so on).
 * The file is written to the app's cache, which the system may clear; it is a hand-off, not a stored copy.
 */
export async function shareTextFile(name: string, content: string, mime: string): Promise<ShareResult> {
  if (Platform.OS === 'web') {
    const url = URL.createObjectURL(new Blob([content], { type: `${mime};charset=utf-8` }));
    const a = document.createElement('a');
    a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
    return 'shared';
  }
  try {
    const { File, Paths } = require('expo-file-system') as typeof import('expo-file-system');
    const Sharing = require('expo-sharing') as typeof import('expo-sharing');
    if (!(await Sharing.isAvailableAsync())) return 'unavailable';
    const file = new File(Paths.cache, name);
    if (file.exists) file.delete();
    file.create();
    file.write(content);
    await Sharing.shareAsync(file.uri, { mimeType: mime, dialogTitle: 'Your Nomi data' });
    return 'shared';
  } catch { return 'unavailable'; }
}
