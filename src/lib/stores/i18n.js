import { writable, derived } from 'svelte/store';
import { browser } from '$app/environment';

// Language configurations
export const languages = {
	en: {
		name: 'English',
		flag: '🇺🇸',
		rtl: false
	},
	es: {
		name: 'Español',
		flag: '🇪🇸',
		rtl: false
	},
	fr: {
		name: 'Français',
		flag: '🇫🇷',
		rtl: false
	},
	de: {
		name: 'Deutsch',
		flag: '🇩🇪',
		rtl: false
	},
	ar: {
		name: 'العربية',
		flag: '🇸🇦',
		rtl: true
	},
	zh: {
		name: '中文',
		flag: '🇨🇳',
		rtl: false
	}
};

// Cache for loaded translations
const translationCache = new Map();

// Get initial language from localStorage or browser preference
function getInitialLanguage() {
	if (!browser) return 'en';
	
	const stored = localStorage.getItem('qrypt-language');
	if (stored && Object.prototype.hasOwnProperty.call(languages, stored)) {
		return stored;
	}
	
	// Check browser language preference
	const browserLang = navigator.language.split('-')[0];
	if (Object.prototype.hasOwnProperty.call(languages, browserLang)) {
		return browserLang;
	}
	
	return 'en';
}

// Create language store
export const currentLanguage = writable(getInitialLanguage());

// Store for loaded translations
const loadedTranslations = writable({});

/**
 * Load translations for a specific language
 * @param {string} languageCode - Language code to load
 * @returns {Promise<Object>} Translation object
 */
async function loadTranslations(languageCode) {
	// Check cache first
	if (translationCache.has(languageCode)) {
		return translationCache.get(languageCode);
	}

	try {
		// Use dynamic import to load the ES6 module from src/lib/locales
		const module = await import(`../locales/${languageCode}.js`);
		const translations = module.default;
		
		if (!translations) {
			throw new Error('Translation file did not export a default object');
		}
		
		// Cache the translations
		translationCache.set(languageCode, translations);
		
		// Update the store
		loadedTranslations.update(current => ({
			...current,
			[languageCode]: translations
		}));
		
		console.log(`📝 [i18n] Loaded translations for language: ${languageCode}`);
		return translations;
	} catch (error) {
		console.error(`📝 [i18n] Failed to load translations for ${languageCode}:`, error);
		
		// Fallback to English if available
		if (languageCode !== 'en' && !translationCache.has('en')) {
			try {
				const fallbackModule = await import('../locales/en.js');
				const fallbackTranslations = fallbackModule.default;
				if (fallbackTranslations) {
					translationCache.set('en', fallbackTranslations);
					return fallbackTranslations;
				}
			} catch (fallbackError) {
				console.error('📝 [i18n] Failed to load fallback English translations:', fallbackError);
			}
		}
		
		return translationCache.get('en') || {};
	}
}

// Derived store for current translations with async loading
export const t = derived(
	[currentLanguage, loadedTranslations],
	([$currentLanguage, $loadedTranslations], set) => {
		// Only load translations on the client side
		if (!browser) {
			// Return identity function for server-side rendering
			set((key) => key);
			return;
		}
		
		// If translations are already loaded, use them immediately
		const currentTranslations = $loadedTranslations[$currentLanguage];
		if (currentTranslations) {
			set((key, params = {}) => {
				let translation = currentTranslations[key] || key;
				
				// Replace parameters in translation
				if (params && typeof params === 'object') {
					Object.entries(params).forEach(([param, value]) => {
						translation = translation.replace(new RegExp(`{{\\s*${param}\\s*}}`, 'g'), String(value));
					});
				}
				
				return translation;
			});
		} else {
			// Load translations asynchronously (client-side only)
			loadTranslations($currentLanguage).then(translations => {
				set((key, params = {}) => {
					let translation = translations[key] || key;
					
					// Replace parameters in translation
					if (params && typeof params === 'object') {
						Object.entries(params).forEach(([param, value]) => {
							translation = translation.replace(new RegExp(`{{\\s*${param}\\s*}}`, 'g'), String(value));
						});
					}
					
					return translation;
				});
			}).catch(error => {
				console.error(`📝 [i18n] Failed to load translations for ${$currentLanguage}:`, error);
				// Fallback to identity function
				set((key) => key);
			});
			
			// Return a temporary function that returns keys until translations load
			set((key) => key);
		}
	},
	(key) => key // Initial value
);

// Language utilities
export const i18nUtils = {
	/**
	 * Set the current language and load its translations
	 * @param {string} languageCode - Language code ('en', 'es', etc.)
	 */
	async setLanguage(languageCode) {
		if (!Object.prototype.hasOwnProperty.call(languages, languageCode)) {
			console.warn(`📝 [i18n] Language "${languageCode}" not found`);
			return;
		}
		
		console.log(`📝 [i18n] Switching to language: ${languageCode}`);
		
		// Load translations first
		await loadTranslations(languageCode);
		
		// Then update the current language
		currentLanguage.set(languageCode);
		
		if (browser) {
			localStorage.setItem('qrypt-language', languageCode);
			this.applyLanguage(languageCode);
		}
	},
	
	/**
	 * Apply language settings to document
	 * @param {string} languageCode - Language code
	 */
	applyLanguage(languageCode) {
		if (!browser || !Object.prototype.hasOwnProperty.call(languages, languageCode)) return;
		
		const language = languages[languageCode];
		if (!language) return;
		
		const root = document.documentElement;
		
		// Set language attribute
		root.setAttribute('lang', languageCode);
		
		// Set direction for RTL languages
		root.setAttribute('dir', language.rtl ? 'rtl' : 'ltr');
		
		// Set data attribute for CSS selectors
		root.setAttribute('data-language', languageCode);
		
		console.log(`📝 [i18n] Applied language settings for: ${languageCode} (RTL: ${language.rtl})`);
	},
	
	/**
	 * Preload translations for a language
	 * @param {string} languageCode - Language code to preload
	 */
	async preloadLanguage(languageCode) {
		if (!Object.prototype.hasOwnProperty.call(languages, languageCode)) {
			console.warn(`📝 [i18n] Cannot preload unknown language: ${languageCode}`);
			return;
		}
		
		await loadTranslations(languageCode);
	},
	
	/**
	 * Get available languages
	 * @returns {object} Available languages
	 */
	getAvailableLanguages() {
		return languages;
	},
	
	/**
	 * Get current language info
	 * @param {string} currentLang - Current language code
	 * @returns {object} Language info
	 */
	getCurrentLanguageInfo(currentLang) {
		return languages[currentLang] || languages.en;
	},
	
	/**
	 * Check if translations are loaded for a language
	 * @param {string} languageCode - Language code to check
	 * @returns {boolean} Whether translations are loaded
	 */
	isLanguageLoaded(languageCode) {
		return translationCache.has(languageCode);
	},
	
	/**
	 * Clear translation cache (useful for development)
	 */
	clearCache() {
		translationCache.clear();
		loadedTranslations.set({});
		console.log('📝 [i18n] Translation cache cleared');
	}
};

// Initialize language on client side only
if (browser) {
	const initialLanguage = getInitialLanguage();
	
	// Apply language settings immediately
	i18nUtils.applyLanguage(initialLanguage);
	
	// Load initial translations
	loadTranslations(initialLanguage).then(() => {
		console.log(`📝 [i18n] Initial language loaded: ${initialLanguage}`);
	}).catch(error => {
		console.error(`📝 [i18n] Failed to load initial language ${initialLanguage}:`, error);
	});
}