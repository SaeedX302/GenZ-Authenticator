/**
 * i18n.ts — Internationalization message loader
 *
 * Supports two modes:
 *  1. Browser default: uses chrome.i18n.getMessage() (follows Chrome UI language)
 *  2. User override: directly loads the specified locale JSON file
 *
 * When a user-selected locale is missing a key, falls back to English.
 */

/** Available locales with display names for the language picker */
export const AVAILABLE_LOCALES: { code: string; name: string }[] = [
  { code: "", name: "Auto (Browser)" },
  { code: "en", name: "English" },
  { code: "zh_CN", name: "简体中文" },
  { code: "zh_TW", name: "繁體中文" },
  { code: "ja", name: "日本語" },
  { code: "ko", name: "한국어" },
  { code: "de", name: "Deutsch" },
  { code: "fr", name: "Français" },
  { code: "es", name: "Español" },
  { code: "pt", name: "Português" },
  { code: "pt_BR", name: "Português (Brasil)" },
  { code: "ru", name: "Русский" },
  { code: "ar", name: "العربية" },
  { code: "hi", name: "हिन्दी" },
  { code: "it", name: "Italiano" },
  { code: "nl", name: "Nederlands" },
  { code: "pl", name: "Polski" },
  { code: "tr", name: "Türkçe" },
  { code: "uk", name: "Українська" },
  { code: "vi", name: "Tiếng Việt" },
  { code: "th", name: "ไทย" },
  { code: "sv", name: "Svenska" },
  { code: "da", name: "Dansk" },
  { code: "fi", name: "Suomi" },
  { code: "no", name: "Norsk" },
  { code: "cs", name: "Čeština" },
  { code: "hu", name: "Magyar" },
  { code: "ro", name: "Română" },
  { code: "bg", name: "Български" },
  { code: "el", name: "Ελληνικά" },
  { code: "he", name: "עברית" },
  { code: "fa", name: "فارسی" },
  { code: "id", name: "Bahasa Indonesia" },
  { code: "hr", name: "Hrvatski" },
  { code: "bn", name: "বাংলা" },
  { code: "ca", name: "Català" },
  { code: "et", name: "Eesti" },
  { code: "fy", name: "Frysk" },
  { code: "hy", name: "Հայերեն" },
  { code: "ka", name: "ქართული" },
  { code: "lt", name: "Lietuvių" },
  { code: "lv", name: "Latviešu" },
  { code: "sq", name: "Shqip" },
  { code: "sr", name: "Српски" },
];

/**
 * Fetch a locale's messages.json and return flat { key: message } map.
 */
function fetchLocaleMessages(
  locale: string
): Promise<{ [key: string]: string }> {
  return new Promise((resolve, reject) => {
    try {
      const xhr = new XMLHttpRequest();
      xhr.overrideMimeType("application/json");
      xhr.onreadystatechange = () => {
        if (xhr.readyState === 4) {
          if (xhr.status === 200 || xhr.status === 0) {
            try {
              const raw: I18nMessage = JSON.parse(xhr.responseText);
              const result: { [key: string]: string } = {};
              for (const key of Object.keys(raw)) {
                result[key] = raw[key].message;
              }
              return resolve(result);
            } catch (e) {
              return reject(new Error(`Failed to parse ${locale} messages`));
            }
          }
          return reject(new Error(`Failed to fetch ${locale} messages`));
        }
      };
      xhr.open(
        "GET",
        chrome.runtime.getURL(`/_locales/${locale}/messages.json`)
      );
      xhr.send();
    } catch (error) {
      reject(error instanceof Error ? error : new Error(String(error)));
    }
  });
}

/**
 * Load i18n messages.
 *
 * @param locale - locale code (e.g. "en", "zh_CN"). Empty string or
 *                 undefined = use browser default via chrome.i18n API.
 */
export async function loadI18nMessages(
  locale?: string
): Promise<{ [key: string]: string }> {
  // Mode 1: Browser default (original behavior)
  if (!locale) {
    return new Promise((resolve, reject) => {
      try {
        const xhr = new XMLHttpRequest();
        xhr.overrideMimeType("application/json");
        xhr.onreadystatechange = () => {
          if (xhr.readyState === 4) {
            const i18nMessage: I18nMessage = JSON.parse(xhr.responseText);
            const i18nData: { [key: string]: string } = {};
            for (const key of Object.keys(i18nMessage)) {
              i18nData[key] = chrome.i18n.getMessage(key);
            }
            return resolve(i18nData);
          }
          return;
        };
        xhr.open("GET", chrome.runtime.getURL("/_locales/en/messages.json"));
        xhr.send();
      } catch (error) {
        if (typeof error === "string" || error === undefined) {
          return reject(Error(error));
        } else if (error instanceof Error) {
          return reject(error);
        } else {
          return reject(Error(String(error)));
        }
      }
    });
  }

  // Mode 2: User-selected locale — load directly from JSON
  // Always load English as fallback for missing keys
  const enMessages = await fetchLocaleMessages("en");

  if (locale === "en") {
    return enMessages;
  }

  try {
    const localeMessages = await fetchLocaleMessages(locale);
    // Merge: locale overrides English fallback
    return { ...enMessages, ...localeMessages };
  } catch {
    // If locale file fails to load, fall back to English
    console.warn(`Locale "${locale}" not available, falling back to English`);
    return enMessages;
  }
}
