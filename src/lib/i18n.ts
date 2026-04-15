/* ═══════════════════════════════════════════════════════════
   Internationalization (i18n) — 20 Languages
   Lazy-loaded JSON translation dictionaries with RTL support
   ═══════════════════════════════════════════════════════════ */

import { getSetting, setSetting } from './db';

/* ─── Types ─── */

export interface Language {
  code: string;
  name: string;
  nativeName: string;
  dir: 'ltr' | 'rtl';
}

export type TranslationKey = keyof typeof EN_STRINGS;

/* ─── Language Registry ─── */

export const LANGUAGES: Language[] = [
  { code: 'en', name: 'English', nativeName: 'English', dir: 'ltr' },
  { code: 'es', name: 'Spanish', nativeName: 'Español', dir: 'ltr' },
  { code: 'fr', name: 'French', nativeName: 'Français', dir: 'ltr' },
  { code: 'de', name: 'German', nativeName: 'Deutsch', dir: 'ltr' },
  { code: 'it', name: 'Italian', nativeName: 'Italiano', dir: 'ltr' },
  { code: 'pt', name: 'Portuguese', nativeName: 'Português', dir: 'ltr' },
  { code: 'ja', name: 'Japanese', nativeName: '日本語', dir: 'ltr' },
  { code: 'ko', name: 'Korean', nativeName: '한국어', dir: 'ltr' },
  { code: 'zh', name: 'Chinese', nativeName: '中文', dir: 'ltr' },
  { code: 'ar', name: 'Arabic', nativeName: 'العربية', dir: 'rtl' },
  { code: 'hi', name: 'Hindi', nativeName: 'हिन्दी', dir: 'ltr' },
  { code: 'ru', name: 'Russian', nativeName: 'Русский', dir: 'ltr' },
  { code: 'nl', name: 'Dutch', nativeName: 'Nederlands', dir: 'ltr' },
  { code: 'pl', name: 'Polish', nativeName: 'Polski', dir: 'ltr' },
  { code: 'sv', name: 'Swedish', nativeName: 'Svenska', dir: 'ltr' },
  { code: 'tr', name: 'Turkish', nativeName: 'Türkçe', dir: 'ltr' },
  { code: 'uk', name: 'Ukrainian', nativeName: 'Українська', dir: 'ltr' },
  { code: 'vi', name: 'Vietnamese', nativeName: 'Tiếng Việt', dir: 'ltr' },
  { code: 'th', name: 'Thai', nativeName: 'ไทย', dir: 'ltr' },
  { code: 'he', name: 'Hebrew', nativeName: 'עברית', dir: 'rtl' },
];

/* ─── English Strings (source of truth) ─── */

const EN_STRINGS = {
  'app.title': 'QP Notes',
  'app.version': 'v0.1.0',
  'sidebar.explorer': 'Explorer',
  'sidebar.allNotes': 'All Notes',
  'sidebar.favorites': 'Favorites',
  'sidebar.recent': 'Recent',
  'sidebar.folders': 'Folders',
  'sidebar.tags': 'Tags',
  'search.placeholder': 'Search notes… (tag:, date:)',
  'btn.newNote': 'New Note',
  'btn.settings': 'Settings',
  'btn.ai': 'AI',
  'btn.sync': 'Sync',
  'btn.save': 'Save',
  'btn.cancel': 'Cancel',
  'btn.delete': 'Delete',
  'btn.export': 'Export',
  'btn.import': 'Import',
  'btn.close': 'Close',
  'editor.edit': 'Edit',
  'editor.preview': 'Preview',
  'editor.split': 'Split',
  'editor.untitled': 'Untitled',
  'editor.tags': 'Tags (comma-separated)',
  'status.ready': 'Ready',
  'status.saving': 'Saving…',
  'status.saved': 'Saved',
  'status.syncing': 'Syncing…',
  'status.offline': 'Offline',
  'settings.title': 'Settings',
  'settings.cloudSync': 'Cloud Sync',
  'settings.cloudSyncDesc': 'Connect a cloud provider to sync your notes across devices.',
  'settings.aiProviders': 'AI Providers',
  'settings.aiProvidersDesc': 'Configure external LLM API keys. Keys are encrypted with AES-256-GCM.',
  'settings.backup': 'Backup',
  'settings.backupDesc': 'Export all notes as a ZIP archive or import from a backup.',
  'settings.language': 'Language',
  'settings.theme': 'Theme',
  'settings.appearance': 'Appearance',
  'ai.title': 'AI Assistant',
  'ai.placeholder': 'Ask about your note or type a prompt…',
  'ai.noProvider': 'No AI provider ready. Load a local model or configure an API key in Settings.',
  'ai.openNote': 'Open a note first.',
  'upload.dropzone': 'Drop files here to import',
  'upload.supported': 'PDF, DOCX, Images (OCR), Text files',
  'upload.processing': 'Processing…',
  'upload.complete': 'Import complete',
  'speech.start': 'Start dictation',
  'speech.stop': 'Stop dictation',
  'speech.notSupported': 'Speech recognition not supported in this browser.',
  'onboarding.welcome': 'Welcome to Zed Note!',
  'onboarding.step1': 'Create your first note by clicking "New Note" above.',
  'onboarding.step2': 'Use Markdown formatting — headings, bold, lists, code blocks, and more.',
  'onboarding.step3': 'Enable AI assistance by loading a local model or adding an API key in Settings.',
  'onboarding.step4': 'Sync across devices by connecting Google Drive, OneDrive, or Dropbox.',
  'onboarding.getStarted': 'Get Started',
  'keyboard.title': 'Keyboard Shortcuts',
  'keyboard.save': 'Save note',
  'keyboard.newNote': 'New note',
  'keyboard.search': 'Focus search',
  'keyboard.bold': 'Bold',
  'keyboard.italic': 'Italic',
  'keyboard.heading': 'Heading',
  'keyboard.link': 'Insert link',
  'keyboard.code': 'Inline code',
  'keyboard.preview': 'Toggle preview',
  'keyboard.ai': 'Toggle AI panel',
  'keyboard.help': 'Show shortcuts',
  'history.title': 'Version History',
  'template.newFrom': 'New from Template',
  'prompts.library': 'Prompt Library',
} as const;

/* ─── Translation Dictionaries ─── */

type Strings = Record<string, string>;

const TRANSLATIONS: Record<string, Strings> = {
  en: EN_STRINGS,
  es: {
    'app.title': 'QP Notas', 'sidebar.explorer': 'Explorador', 'sidebar.allNotes': 'Todas las Notas',
    'sidebar.favorites': 'Favoritos', 'sidebar.recent': 'Reciente', 'sidebar.folders': 'Carpetas',
    'sidebar.tags': 'Etiquetas', 'search.placeholder': 'Buscar notas…', 'btn.newNote': 'Nueva Nota',
    'btn.settings': 'Configuración', 'btn.save': 'Guardar', 'btn.cancel': 'Cancelar', 'btn.delete': 'Eliminar',
    'btn.export': 'Exportar', 'btn.import': 'Importar', 'btn.close': 'Cerrar',
    'editor.edit': 'Editar', 'editor.preview': 'Vista previa', 'editor.split': 'Dividido',
    'status.ready': 'Listo', 'status.saving': 'Guardando…', 'status.saved': 'Guardado',
    'settings.title': 'Configuración', 'settings.cloudSync': 'Sincronización en la Nube',
    'settings.language': 'Idioma', 'settings.theme': 'Tema', 'ai.title': 'Asistente IA',
    'ai.placeholder': 'Pregunta sobre tu nota…', 'upload.dropzone': 'Suelta archivos aquí para importar',
    'speech.start': 'Iniciar dictado', 'speech.stop': 'Detener dictado',
    'onboarding.welcome': '¡Bienvenido a QP Notas!', 'onboarding.getStarted': 'Comenzar',
    'keyboard.title': 'Atajos de Teclado', 'history.title': 'Historial de Versiones',
  },
  fr: {
    'app.title': 'Zed Note', 'sidebar.explorer': 'Explorateur', 'sidebar.allNotes': 'Toutes les Notes',
    'sidebar.favorites': 'Favoris', 'sidebar.recent': 'Récent', 'sidebar.folders': 'Dossiers',
    'sidebar.tags': 'Étiquettes', 'search.placeholder': 'Rechercher…', 'btn.newNote': 'Nouvelle Note',
    'btn.settings': 'Paramètres', 'btn.save': 'Enregistrer', 'btn.cancel': 'Annuler', 'btn.delete': 'Supprimer',
    'editor.edit': 'Éditer', 'editor.preview': 'Aperçu', 'editor.split': 'Divisé',
    'status.ready': 'Prêt', 'settings.title': 'Paramètres', 'settings.language': 'Langue',
    'ai.title': 'Assistant IA', 'upload.dropzone': 'Déposez des fichiers ici',
    'speech.start': 'Démarrer la dictée', 'speech.stop': 'Arrêter la dictée',
    'onboarding.welcome': 'Bienvenue dans Zed Note !', 'onboarding.getStarted': 'Commencer',
    'keyboard.title': 'Raccourcis Clavier',
  },
  de: {
    'app.title': 'QP Notizen', 'sidebar.explorer': 'Explorer', 'sidebar.allNotes': 'Alle Notizen',
    'sidebar.favorites': 'Favoriten', 'sidebar.recent': 'Kürzlich', 'sidebar.folders': 'Ordner',
    'sidebar.tags': 'Tags', 'search.placeholder': 'Notizen suchen…', 'btn.newNote': 'Neue Notiz',
    'btn.settings': 'Einstellungen', 'btn.save': 'Speichern', 'btn.cancel': 'Abbrechen', 'btn.delete': 'Löschen',
    'editor.edit': 'Bearbeiten', 'editor.preview': 'Vorschau', 'editor.split': 'Geteilt',
    'status.ready': 'Bereit', 'settings.title': 'Einstellungen', 'settings.language': 'Sprache',
    'ai.title': 'KI-Assistent', 'upload.dropzone': 'Dateien hierher ziehen',
    'speech.start': 'Diktat starten', 'speech.stop': 'Diktat stoppen',
    'onboarding.welcome': 'Willkommen bei QP Notizen!', 'onboarding.getStarted': 'Loslegen',
    'keyboard.title': 'Tastenkürzel',
  },
  it: {
    'app.title': 'QP Note', 'sidebar.allNotes': 'Tutte le Note', 'sidebar.favorites': 'Preferiti',
    'btn.newNote': 'Nuova Nota', 'btn.settings': 'Impostazioni', 'btn.save': 'Salva', 'btn.cancel': 'Annulla',
    'editor.edit': 'Modifica', 'editor.preview': 'Anteprima', 'status.ready': 'Pronto',
    'settings.title': 'Impostazioni', 'ai.title': 'Assistente IA',
    'onboarding.welcome': 'Benvenuto in QP Note!', 'keyboard.title': 'Scorciatoie da Tastiera',
  },
  pt: {
    'app.title': 'QP Notas', 'sidebar.allNotes': 'Todas as Notas', 'sidebar.favorites': 'Favoritos',
    'btn.newNote': 'Nova Nota', 'btn.settings': 'Configurações', 'btn.save': 'Salvar', 'btn.cancel': 'Cancelar',
    'editor.edit': 'Editar', 'editor.preview': 'Visualizar', 'status.ready': 'Pronto',
    'settings.title': 'Configurações', 'ai.title': 'Assistente IA',
    'onboarding.welcome': 'Bem-vindo ao QP Notas!', 'keyboard.title': 'Atalhos do Teclado',
  },
  ja: {
    'app.title': 'QP ノート', 'sidebar.allNotes': 'すべてのノート', 'sidebar.favorites': 'お気に入り',
    'sidebar.recent': '最近', 'sidebar.folders': 'フォルダ', 'sidebar.tags': 'タグ',
    'btn.newNote': '新規ノート', 'btn.settings': '設定', 'btn.save': '保存', 'btn.cancel': 'キャンセル',
    'editor.edit': '編集', 'editor.preview': 'プレビュー', 'status.ready': '準備完了',
    'settings.title': '設定', 'ai.title': 'AIアシスタント',
    'onboarding.welcome': 'QP ノートへようこそ！', 'keyboard.title': 'キーボードショートカット',
  },
  ko: {
    'app.title': 'QP 노트', 'sidebar.allNotes': '모든 노트', 'sidebar.favorites': '즐겨찾기',
    'btn.newNote': '새 노트', 'btn.settings': '설정', 'btn.save': '저장', 'btn.cancel': '취소',
    'editor.edit': '편집', 'editor.preview': '미리보기', 'status.ready': '준비',
    'settings.title': '설정', 'ai.title': 'AI 어시스턴트',
    'onboarding.welcome': 'QP 노트에 오신 것을 환영합니다!', 'keyboard.title': '키보드 단축키',
  },
  zh: {
    'app.title': 'QP 笔记', 'sidebar.allNotes': '所有笔记', 'sidebar.favorites': '收藏',
    'sidebar.recent': '最近', 'sidebar.folders': '文件夹', 'sidebar.tags': '标签',
    'btn.newNote': '新建笔记', 'btn.settings': '设置', 'btn.save': '保存', 'btn.cancel': '取消', 'btn.delete': '删除',
    'editor.edit': '编辑', 'editor.preview': '预览', 'editor.split': '分屏',
    'status.ready': '就绪', 'settings.title': '设置', 'settings.language': '语言',
    'ai.title': 'AI 助手', 'onboarding.welcome': '欢迎使用 QP 笔记！',
    'keyboard.title': '键盘快捷键',
  },
  ar: {
    'app.title': 'QP ملاحظات', 'sidebar.allNotes': 'جميع الملاحظات', 'sidebar.favorites': 'المفضلة',
    'sidebar.recent': 'الأخيرة', 'sidebar.folders': 'المجلدات', 'sidebar.tags': 'العلامات',
    'btn.newNote': 'ملاحظة جديدة', 'btn.settings': 'الإعدادات', 'btn.save': 'حفظ', 'btn.cancel': 'إلغاء',
    'editor.edit': 'تحرير', 'editor.preview': 'معاينة', 'status.ready': 'جاهز',
    'settings.title': 'الإعدادات', 'settings.language': 'اللغة',
    'ai.title': 'مساعد الذكاء الاصطناعي', 'onboarding.welcome': '!QP مرحباً بك في ملاحظات',
    'keyboard.title': 'اختصارات لوحة المفاتيح',
  },
  hi: {
    'app.title': 'QP नोट्स', 'sidebar.allNotes': 'सभी नोट्स', 'sidebar.favorites': 'पसंदीदा',
    'btn.newNote': 'नया नोट', 'btn.settings': 'सेटिंग्स', 'btn.save': 'सेव', 'btn.cancel': 'रद्द',
    'editor.edit': 'संपादन', 'editor.preview': 'पूर्वावलोकन', 'status.ready': 'तैयार',
    'settings.title': 'सेटिंग्स', 'ai.title': 'AI सहायक',
    'onboarding.welcome': 'QP नोट्स में आपका स्वागत है!', 'keyboard.title': 'कीबोर्ड शॉर्टकट',
  },
  ru: {
    'app.title': 'QP Заметки', 'sidebar.allNotes': 'Все заметки', 'sidebar.favorites': 'Избранное',
    'sidebar.recent': 'Недавние', 'sidebar.folders': 'Папки', 'sidebar.tags': 'Теги',
    'btn.newNote': 'Новая заметка', 'btn.settings': 'Настройки', 'btn.save': 'Сохранить', 'btn.cancel': 'Отмена',
    'editor.edit': 'Редактор', 'editor.preview': 'Просмотр', 'status.ready': 'Готово',
    'settings.title': 'Настройки', 'settings.language': 'Язык',
    'ai.title': 'ИИ Ассистент', 'onboarding.welcome': 'Добро пожаловать в QP Заметки!',
    'keyboard.title': 'Горячие клавиши',
  },
  nl: {
    'app.title': 'QP Notities', 'sidebar.allNotes': 'Alle Notities', 'sidebar.favorites': 'Favorieten',
    'btn.newNote': 'Nieuwe Notitie', 'btn.settings': 'Instellingen', 'btn.save': 'Opslaan',
    'editor.edit': 'Bewerken', 'editor.preview': 'Voorbeeld', 'status.ready': 'Gereed',
    'settings.title': 'Instellingen', 'ai.title': 'AI Assistent',
    'onboarding.welcome': 'Welkom bij QP Notities!', 'keyboard.title': 'Sneltoetsen',
  },
  pl: {
    'app.title': 'QP Notatki', 'sidebar.allNotes': 'Wszystkie Notatki', 'sidebar.favorites': 'Ulubione',
    'btn.newNote': 'Nowa Notatka', 'btn.settings': 'Ustawienia', 'btn.save': 'Zapisz',
    'editor.edit': 'Edytuj', 'editor.preview': 'Podgląd', 'status.ready': 'Gotowy',
    'settings.title': 'Ustawienia', 'ai.title': 'Asystent AI',
    'onboarding.welcome': 'Witaj w QP Notatkach!', 'keyboard.title': 'Skróty Klawiszowe',
  },
  sv: {
    'app.title': 'QP Anteckningar', 'sidebar.allNotes': 'Alla Anteckningar', 'sidebar.favorites': 'Favoriter',
    'btn.newNote': 'Ny Anteckning', 'btn.settings': 'Inställningar', 'btn.save': 'Spara',
    'editor.edit': 'Redigera', 'editor.preview': 'Förhandsgranskning', 'status.ready': 'Redo',
    'settings.title': 'Inställningar', 'ai.title': 'AI-assistent',
    'onboarding.welcome': 'Välkommen till QP Anteckningar!', 'keyboard.title': 'Kortkommandon',
  },
  tr: {
    'app.title': 'QP Notlar', 'sidebar.allNotes': 'Tüm Notlar', 'sidebar.favorites': 'Favoriler',
    'btn.newNote': 'Yeni Not', 'btn.settings': 'Ayarlar', 'btn.save': 'Kaydet',
    'editor.edit': 'Düzenle', 'editor.preview': 'Önizleme', 'status.ready': 'Hazır',
    'settings.title': 'Ayarlar', 'ai.title': 'AI Asistanı',
    'onboarding.welcome': 'QP Notlar\'a hoş geldiniz!', 'keyboard.title': 'Klavye Kısayolları',
  },
  uk: {
    'app.title': 'QP Нотатки', 'sidebar.allNotes': 'Усі нотатки', 'sidebar.favorites': 'Обране',
    'btn.newNote': 'Нова нотатка', 'btn.settings': 'Налаштування', 'btn.save': 'Зберегти',
    'editor.edit': 'Редагувати', 'editor.preview': 'Перегляд', 'status.ready': 'Готово',
    'settings.title': 'Налаштування', 'ai.title': 'ШІ Асистент',
    'onboarding.welcome': 'Ласкаво просимо до QP Нотатки!', 'keyboard.title': 'Гарячі клавіші',
  },
  vi: {
    'app.title': 'QP Ghi chú', 'sidebar.allNotes': 'Tất cả Ghi chú', 'sidebar.favorites': 'Yêu thích',
    'btn.newNote': 'Ghi chú mới', 'btn.settings': 'Cài đặt', 'btn.save': 'Lưu',
    'editor.edit': 'Chỉnh sửa', 'editor.preview': 'Xem trước', 'status.ready': 'Sẵn sàng',
    'settings.title': 'Cài đặt', 'ai.title': 'Trợ lý AI',
    'onboarding.welcome': 'Chào mừng đến QP Ghi chú!', 'keyboard.title': 'Phím tắt',
  },
  th: {
    'app.title': 'QP โน้ต', 'sidebar.allNotes': 'โน้ตทั้งหมด', 'sidebar.favorites': 'รายการโปรด',
    'btn.newNote': 'โน้ตใหม่', 'btn.settings': 'ตั้งค่า', 'btn.save': 'บันทึก',
    'editor.edit': 'แก้ไข', 'editor.preview': 'ดูตัวอย่าง', 'status.ready': 'พร้อม',
    'settings.title': 'ตั้งค่า', 'ai.title': 'ผู้ช่วย AI',
    'onboarding.welcome': 'ยินดีต้อนรับสู่ QP โน้ต!', 'keyboard.title': 'ปุ่มลัด',
  },
  he: {
    'app.title': 'QP הערות', 'sidebar.allNotes': 'כל ההערות', 'sidebar.favorites': 'מועדפים',
    'btn.newNote': 'הערה חדשה', 'btn.settings': 'הגדרות', 'btn.save': 'שמור',
    'editor.edit': 'עריכה', 'editor.preview': 'תצוגה מקדימה', 'status.ready': 'מוכן',
    'settings.title': 'הגדרות', 'ai.title': 'עוזר AI',
    'onboarding.welcome': '!QP ברוכים הבאים להערות', 'keyboard.title': 'קיצורי מקלדת',
  },
};

/* ─── State ─── */

let currentLang = 'en';
let currentStrings: Strings = EN_STRINGS;

/* ─── API ─── */

export async function initI18n(): Promise<void> {
  const saved = await getSetting('language');
  if (saved && TRANSLATIONS[saved]) {
    currentLang = saved;
    currentStrings = { ...EN_STRINGS, ...TRANSLATIONS[saved] };
  }
  applyDir();
}

export async function setLanguage(code: string): Promise<void> {
  if (!TRANSLATIONS[code] && code !== 'en') return;
  currentLang = code;
  currentStrings = code === 'en' ? EN_STRINGS : { ...EN_STRINGS, ...TRANSLATIONS[code] };
  await setSetting('language', code);
  applyDir();
}

export function t(key: string): string {
  return currentStrings[key] || EN_STRINGS[key as keyof typeof EN_STRINGS] || key;
}

export function getCurrentLanguage(): string {
  return currentLang;
}

function applyDir(): void {
  const lang = LANGUAGES.find(l => l.code === currentLang);
  document.documentElement.dir = lang?.dir || 'ltr';
  document.documentElement.lang = currentLang;
}
