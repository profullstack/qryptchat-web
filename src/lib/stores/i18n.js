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

// Translation dictionaries
const translations = {
	en: {
		// Navigation
		'nav.home': 'Home',
		'nav.chat': 'Chat',
		'nav.settings': 'Settings',
		'nav.profile': 'Profile',
		'nav.logout': 'Logout',
		'nav.login': 'Login',
		'nav.register': 'Register',
		
		// Theme
		'theme.light': 'Light',
		'theme.dark': 'Dark',
		'theme.system': 'System',
		'theme.switch': 'Switch Theme',
		
		// Language
		'language.switch': 'Switch Language',
		'language.current': 'Current Language',
		
		// Common
		'common.loading': 'Loading...',
		'common.error': 'Error',
		'common.success': 'Success',
		'common.cancel': 'Cancel',
		'common.confirm': 'Confirm',
		'common.save': 'Save',
		'common.delete': 'Delete',
		'common.edit': 'Edit',
		'common.close': 'Close',
		'common.back': 'Back',
		'common.next': 'Next',
		'common.previous': 'Previous',
		'common.submit': 'Submit',
		'common.search': 'Search',
		'common.filter': 'Filter',
		'common.sort': 'Sort',
		'common.refresh': 'Refresh',
		
		// App
		'app.name': 'QryptChat',
		'app.tagline': 'Quantum-Resistant Messaging',
		'app.description': 'Secure, quantum-resistant end-to-end encrypted messaging',
		
		// Auth
		'auth.title': 'Sign In',
		'auth.subtitle': 'Secure authentication via SMS',
		'auth.enterPhone': 'Enter your phone number',
		'auth.phoneDescription': 'We\'ll send you a verification code to confirm your identity.',
		'auth.phoneNumber': 'Phone Number',
		'auth.sendCode': 'Send Code',
		'auth.sending': 'Sending...',
		'auth.enterCode': 'Enter verification code',
		'auth.codeDescription': 'Enter the 6-digit code sent to',
		'auth.verificationCode': 'Verification Code',
		'auth.verify': 'Verify',
		'auth.verifying': 'Verifying...',
		'auth.resendCode': 'Resend Code',
		'auth.resendIn': 'Resend in',
		'auth.createProfile': 'Create Your Profile',
		'auth.profileDescription': 'Choose a username to complete your account setup.',
		'auth.username': 'Username',
		'auth.displayName': 'Display Name (Optional)',
		'auth.createAccount': 'Create Account',
		'auth.creating': 'Creating...',
		'auth.privacyNote': 'Your phone number is used only for authentication and will not be shared.',
		'auth.phone': 'Phone Number',
		'auth.phone.placeholder': 'Enter your phone number',
		'auth.code': 'Verification Code',
		'auth.code.placeholder': 'Enter verification code',
		'auth.send.code': 'Send Code',
		'auth.verify.code': 'Verify Code',
		'auth.resend.code': 'Resend Code',
		'auth.login.title': 'Sign In',
		'auth.register.title': 'Create Account',
		'auth.logout.confirm': 'Are you sure you want to logout?',
		
		// Errors
		'error.network': 'Network error. Please check your connection.',
		'error.invalid.phone': 'Please enter a valid phone number.',
		'error.invalid.code': 'Invalid verification code.',
		'error.code.expired': 'Verification code has expired.',
		'error.too.many.attempts': 'Too many attempts. Please try again later.',
		'error.unknown': 'An unexpected error occurred.',
		
		// Success messages
		'success.code.sent': 'Verification code sent successfully.',
		'success.login': 'Successfully signed in.',
		'success.logout': 'Successfully signed out.',
		'success.settings.saved': 'Settings saved successfully.',
		
		// Footer
		'footer.followUs': 'Follow us:',
		'footer.privacy': 'Privacy Policy',
		'footer.terms': 'Terms of Service',
		'footer.security': 'Security',
		'footer.contact': 'Contact'
	},
	es: {
		// Navigation
		'nav.home': 'Inicio',
		'nav.chat': 'Chat',
		'nav.settings': 'Configuración',
		'nav.profile': 'Perfil',
		'nav.logout': 'Cerrar Sesión',
		'nav.login': 'Iniciar Sesión',
		'nav.register': 'Registrarse',
		
		// Theme
		'theme.light': 'Claro',
		'theme.dark': 'Oscuro',
		'theme.system': 'Sistema',
		'theme.switch': 'Cambiar Tema',
		
		// Language
		'language.switch': 'Cambiar Idioma',
		'language.current': 'Idioma Actual',
		
		// Common
		'common.loading': 'Cargando...',
		'common.error': 'Error',
		'common.success': 'Éxito',
		'common.cancel': 'Cancelar',
		'common.confirm': 'Confirmar',
		'common.save': 'Guardar',
		'common.delete': 'Eliminar',
		'common.edit': 'Editar',
		'common.close': 'Cerrar',
		'common.back': 'Atrás',
		'common.next': 'Siguiente',
		'common.previous': 'Anterior',
		'common.submit': 'Enviar',
		'common.search': 'Buscar',
		'common.filter': 'Filtrar',
		'common.sort': 'Ordenar',
		'common.refresh': 'Actualizar',
		
		// App
		'app.name': 'QryptChat',
		'app.tagline': 'Mensajería Resistente a Quantum',
		'app.description': 'Mensajería segura y cifrada de extremo a extremo resistente a quantum',
		
		// Auth
		'auth.phone': 'Número de Teléfono',
		'auth.phone.placeholder': 'Ingresa tu número de teléfono',
		'auth.code': 'Código de Verificación',
		'auth.code.placeholder': 'Ingresa el código de verificación',
		'auth.send.code': 'Enviar Código',
		'auth.verify.code': 'Verificar Código',
		'auth.resend.code': 'Reenviar Código',
		'auth.login.title': 'Iniciar Sesión',
		'auth.register.title': 'Crear Cuenta',
		'auth.logout.confirm': '¿Estás seguro de que quieres cerrar sesión?',
		
		// Errors
		'error.network': 'Error de red. Por favor verifica tu conexión.',
		'error.invalid.phone': 'Por favor ingresa un número de teléfono válido.',
		'error.invalid.code': 'Código de verificación inválido.',
		'error.code.expired': 'El código de verificación ha expirado.',
		'error.too.many.attempts': 'Demasiados intentos. Por favor intenta más tarde.',
		'error.unknown': 'Ocurrió un error inesperado.',
		
		// Success messages
		'success.code.sent': 'Código de verificación enviado exitosamente.',
		'success.login': 'Sesión iniciada exitosamente.',
		'success.logout': 'Sesión cerrada exitosamente.',
		'success.settings.saved': 'Configuración guardada exitosamente.'
	}
	// Additional languages can be added here
};

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

// Derived store for current translations
export const t = derived(currentLanguage, ($currentLanguage) => {
	const currentTranslations = translations[$currentLanguage] || translations.en;
	
	return (key, params = {}) => {
		let translation = currentTranslations[key] || key;
		
		// Replace parameters in translation
		Object.entries(params).forEach(([param, value]) => {
			translation = translation.replace(new RegExp(`{{\\s*${param}\\s*}}`, 'g'), value);
		});
		
		return translation;
	};
});

// Language utilities
export const i18nUtils = {
	/**
	 * Set the current language
	 * @param {string} languageCode - Language code ('en', 'es', etc.)
	 */
	setLanguage(languageCode) {
		if (!Object.prototype.hasOwnProperty.call(languages, languageCode)) {
			console.warn(`Language "${languageCode}" not found`);
			return;
		}
		
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
		const root = document.documentElement;
		
		// Set language attribute
		root.setAttribute('lang', languageCode);
		
		// Set direction for RTL languages
		root.setAttribute('dir', language.rtl ? 'rtl' : 'ltr');
		
		// Set data attribute for CSS selectors
		root.setAttribute('data-language', languageCode);
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
	}
};

// Initialize language on client side
if (browser) {
	const initialLanguage = getInitialLanguage();
	i18nUtils.applyLanguage(initialLanguage);
}