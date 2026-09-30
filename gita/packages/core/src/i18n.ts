/**
 * Minimal, dependency-free UI i18n. The RN app can layer i18next on top, but keeping the
 * catalog here lets us unit-test that UI language is independent of content language (spec §4).
 */

export type UiLang = "en" | "te";

export type MessageKey =
  | "home.continueLearning"
  | "home.todaysVerse"
  | "home.dailyReflection"
  | "home.continueListening"
  | "home.chapters"
  | "home.bookmarks"
  | "home.notes"
  | "home.aiTeacher"
  | "home.search"
  | "verse.sanskrit"
  | "verse.transliteration"
  | "verse.translation"
  | "verse.simpleMeaning"
  | "verse.deeperMeaning"
  | "verse.practicalApplication"
  | "verse.askAboutThis"
  | "verse.noTranslationYet"
  | "common.startReading"
  | "common.startListening"
  | "common.aiGenerated";

type Catalog = Record<MessageKey, string>;

const en: Catalog = {
  "home.continueLearning": "Continue Learning",
  "home.todaysVerse": "Today's Verse",
  "home.dailyReflection": "Daily Reflection",
  "home.continueListening": "Continue Listening",
  "home.chapters": "Chapters",
  "home.bookmarks": "Bookmarked Verses",
  "home.notes": "My Notes",
  "home.aiTeacher": "AI Gita Teacher",
  "home.search": "Search",
  "verse.sanskrit": "Sanskrit",
  "verse.transliteration": "Transliteration",
  "verse.translation": "Translation",
  "verse.simpleMeaning": "Simple Meaning",
  "verse.deeperMeaning": "Deeper Meaning",
  "verse.practicalApplication": "Practical Application",
  "verse.askAboutThis": "Ask about this verse",
  "verse.noTranslationYet": "No translation available yet in this language.",
  "common.startReading": "Start Reading",
  "common.startListening": "Start Listening",
  "common.aiGenerated": "AI-generated — not scripture",
};

const te: Catalog = {
  "home.continueLearning": "నేర్చుకోవడం కొనసాగించండి",
  "home.todaysVerse": "నేటి శ్లోకం",
  "home.dailyReflection": "నేటి ధ్యానం",
  "home.continueListening": "వినడం కొనసాగించండి",
  "home.chapters": "అధ్యాయాలు",
  "home.bookmarks": "గుర్తుపెట్టిన శ్లోకాలు",
  "home.notes": "నా గమనికలు",
  "home.aiTeacher": "AI గీతా గురువు",
  "home.search": "వెతకండి",
  "verse.sanskrit": "సంస్కృతం",
  "verse.transliteration": "లిప్యంతరీకరణ",
  "verse.translation": "అనువాదం",
  "verse.simpleMeaning": "సరళ అర్థం",
  "verse.deeperMeaning": "లోతైన అర్థం",
  "verse.practicalApplication": "ఆచరణాత్మక అనువర్తనం",
  "verse.askAboutThis": "ఈ శ్లోకం గురించి అడగండి",
  "verse.noTranslationYet": "ఈ భాషలో ఇంకా అనువాదం అందుబాటులో లేదు.",
  "common.startReading": "చదవడం ప్రారంభించండి",
  "common.startListening": "వినడం ప్రారంభించండి",
  "common.aiGenerated": "AI రూపొందించినది — ఇది శాస్త్రం కాదు",
};

const catalogs: Record<UiLang, Catalog> = { en, te };

export function createTranslator(lang: UiLang) {
  const catalog = catalogs[lang];
  return (key: MessageKey): string => catalog[key];
}
