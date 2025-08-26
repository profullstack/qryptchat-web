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
		'footer.contact': 'Contact',
		
		// Chat
		'chat.title': 'Chat',
		'chat.newChat': 'New Chat',
		'chat.joinGroup': 'Join Group',
		'chat.addParticipants': 'Add Participants',
		'chat.selectConversation': 'Select a conversation to start messaging',
		'chat.typeMessage': 'Type a message...',
		'chat.sendMessage': 'Send message',
		'chat.attachFile': 'Attach file',
		'chat.noMessages': 'No messages yet',
		'chat.noMessagesRoom': 'No messages in this room',
		'chat.unknownUser': 'Unknown User',
		'chat.unknownGroup': 'Unknown Group',
		'chat.decrypting': 'Decrypting...',
		'chat.messageUnavailable': 'Message content unavailable',
		'chat.encryptedMessageFailed': 'Encrypted message - decryption failed',
		
		// Modals
		'modal.close': 'Close',
		'modal.closeModal': 'Close modal',
		'modal.cancel': 'Cancel',
		'modal.confirm': 'Confirm',
		'modal.save': 'Save',
		'modal.create': 'Create',
		'modal.add': 'Add',
		'modal.remove': 'Remove',
		'modal.delete': 'Delete',
		
		// New Chat Modal
		'newChat.title': 'New Chat',
		'newChat.directMessage': 'Direct Message',
		'newChat.group': 'Group',
		'newChat.channel': 'Channel',
		'newChat.searchUsers': 'Search users...',
		'newChat.groupName': 'Group Name',
		'newChat.groupNamePlaceholder': 'Enter group name',
		'newChat.startChat': 'Start Chat',
		'newChat.createGroup': 'Create Group',
		'newChat.createChannel': 'Create Channel',
		'newChat.selectUsers': 'Please select at least one user',
		'newChat.enterGroupName': 'Please enter a group name',
		'newChat.failedToCreate': 'Failed to create conversation',
		'newChat.removeUser': 'Remove user from selection',
		
		// Add Participants Modal
		'addParticipants.title': 'Add Participants',
		'addParticipants.search': 'Search users...',
		'addParticipants.add': 'Add Participants',
		'addParticipants.failedToSearch': 'Failed to search users',
		'addParticipants.failedToAdd': 'Failed to add participants',
		'addParticipants.successAdded': 'Participants added successfully',
		
		// Settings
		'settings.title': 'Settings',
		'settings.profile': 'Profile',
		'settings.security': 'Security',
		'settings.notifications': 'Notifications',
		'settings.appearance': 'Appearance',
		'settings.privacy': 'Privacy',
		'settings.advanced': 'Advanced',
		'settings.failedToLoad': 'Failed to load settings',
		'settings.failedToSave': 'Failed to save settings',
		'settings.saved': 'Settings saved successfully',
		
		// Encryption Settings
		'encryption.title': 'Encryption',
		'encryption.status': 'Encryption Status',
		'encryption.enabled': 'Enabled',
		'encryption.disabled': 'Disabled',
		'encryption.generate': 'Generate Keys',
		'encryption.regenerate': 'Regenerate Keys',
		'encryption.failedToCheck': 'Failed to check encryption status',
		'encryption.failedToGenerate': 'Failed to generate encryption keys',
		'encryption.failedToRegenerate': 'Failed to regenerate encryption keys',
		
		// Private Key Manager
		'privateKey.title': 'Private Key Manager',
		'privateKey.export': 'Export Private Keys',
		'privateKey.import': 'Import Private Keys',
		'privateKey.password': 'Password',
		'privateKey.confirmPassword': 'Confirm Password',
		'privateKey.enterPassword': 'Please enter a password to protect your exported keys',
		'privateKey.passwordsNoMatch': 'Passwords do not match',
		'privateKey.gpgPassword': 'GPG Password',
		'privateKey.confirmGPGPassword': 'Confirm GPG Password',
		'privateKey.enterGPGPassword': 'Please enter a GPG password for additional encryption',
		'privateKey.gpgPasswordsNoMatch': 'GPG passwords do not match',
		'privateKey.enableGPG': 'Enable GPG encryption for additional security',
		'privateKey.exportPasswordPlaceholder': 'Enter a strong password to protect your keys',
		'privateKey.confirmPasswordPlaceholder': 'Confirm your password',
		'privateKey.gpgPasswordPlaceholder': 'Enter a strong GPG password',
		'privateKey.confirmGPGPasswordPlaceholder': 'Confirm your GPG password',
		'privateKey.selectFile': 'Please select a key file to import',
		'privateKey.enterImportPassword': 'Please enter the password used to protect your keys',
		'privateKey.importPasswordPlaceholder': 'Enter the password used to protect your keys',
		'privateKey.dropFile': 'Drop key file here or click to select',
		'privateKey.failedToExport': 'Failed to export private keys',
		'privateKey.failedToImport': 'Failed to import private keys',
		'privateKey.failedToRead': 'Failed to read file',
		
		// SMS Notifications
		'sms.title': 'SMS Notifications',
		'sms.enabled': 'SMS notifications enabled',
		'sms.disabled': 'SMS notifications disabled',
		'sms.userNotFound': 'User not found',
		'sms.updated': 'SMS notification preference updated successfully',
		'sms.failedToUpdate': 'Failed to update SMS notification preference',
		
		// Disappearing Messages
		'disappearing.title': 'Disappearing Messages',
		'disappearing.enabled': 'Enabled',
		'disappearing.disabled': 'Disabled',
		'disappearing.duration': 'Duration',
		'disappearing.startOn': 'Start On',
		'disappearing.delivered': 'When delivered',
		'disappearing.read': 'When read',
		'disappearing.starts': 'Starts',
		'disappearing.failedToLoad': 'Failed to load settings',
		'disappearing.failedToSave': 'Failed to save settings',
		'disappearing.saved': 'Settings saved successfully',
		
		// Profile
		'profile.title': 'Profile',
		'profile.displayName': 'Display Name',
		'profile.username': 'Username',
		'profile.phone': 'Phone Number',
		'profile.avatar': 'Profile Picture',
		'profile.changeAvatar': 'Change profile picture',
		'profile.removeAvatar': 'Remove avatar',
		'profile.addPhoto': 'Add Photo',
		'profile.uploading': 'Uploading...',
		'profile.failedToUpdate': 'Failed to update profile',
		'profile.failedToUpload': 'Failed to upload profile picture',
		'profile.failedToRemove': 'Failed to remove avatar',
		'profile.removed': 'Profile picture removed',
		'profile.closeUpload': 'Close avatar upload',
		'profile.avatarPreview': 'Avatar preview',
		
		// Conversation Menu
		'conversation.settings': 'Conversation Settings',
		'conversation.failedToSave': 'Failed to save settings',
		
		// Toast Messages
		'toast.install': 'Install QryptChat',
		'toast.installMessage': 'Get the full app experience with offline support',
		'toast.install.button': 'Install',
		'toast.later': 'Later',
		'toast.update': 'Update Available',
		'toast.updateMessage': 'A new version of QryptChat is ready',
		'toast.update.button': 'Update',
		'toast.accept': 'Accept',
		'toast.dismiss': 'Dismiss',
		'toast.close': 'Close notification',
		
		// Join Group Modal
		'joinGroup.title': 'Join Group',
		'joinGroup.inviteCode': 'Invite Code',
		'joinGroup.join': 'Join Group',
		'joinGroup.failedToJoin': 'Failed to join group',
		'joinGroup.notImplemented': 'Not implemented in WebSocket store yet',
		
		// Placeholders and Labels
		'placeholder.phoneNumber': 'Enter your phone number',
		'placeholder.displayName': 'John Doe',
		'placeholder.search': 'Search...',
		'placeholder.groupName': 'Enter group name',
		
		// Aria Labels
		'aria.userMenu': 'User menu',
		'aria.toggleMobileMenu': 'Toggle mobile menu',
		'aria.closeModal': 'Close modal',
		'aria.closeNotification': 'Close notification',
		'aria.dismissMessage': 'Dismiss message',
		'aria.removeUser': 'Remove user from selection',
		'aria.attachFile': 'Attach file',
		'aria.sendMessage': 'Send message',
		'aria.newChat': 'Create new chat',
		'aria.joinGroup': 'Join existing group',
		'aria.addParticipants': 'Add participants to conversation',
		'aria.changeAvatar': 'Change profile picture',
		'aria.removeAvatar': 'Remove avatar',
		'aria.closeUpload': 'Close avatar upload',
		'aria.dropFile': 'Drop key file here or click to select',
		
		// Page Titles
		'page.home': 'Home',
		'page.chat': 'Chat',
		'page.settings': 'Settings',
		'page.profile': 'Profile',
		'page.premium': 'Upgrade to Premium',
		'page.testDropdown': 'Test Dropdown',
		
		// Meta Descriptions
		'meta.home': 'QryptChat - Quantum-resistant end-to-end encrypted messaging',
		'meta.premium': 'Upgrade to QryptChat Premium for enhanced features',
		'meta.testDropdown': 'Test page for dropdown functionality',
		'meta.profile': 'View {{username}}\'s profile on QryptChat',
		
		// Buttons and Actions
		'button.login': 'Login',
		'button.logout': 'Logout',
		'button.test': 'Test',
		'button.install': 'Install',
		'button.update': 'Update',
		'button.later': 'Later',
		'button.accept': 'Accept',
		'button.dismiss': 'Dismiss',
		'button.close': 'Close',
		'button.cancel': 'Cancel',
		'button.save': 'Save',
		'button.create': 'Create',
		'button.add': 'Add',
		'button.remove': 'Remove',
		'button.delete': 'Delete',
		'button.edit': 'Edit',
		'button.export': 'Export',
		'button.import': 'Import',
		'button.generate': 'Generate',
		'button.regenerate': 'Regenerate',
		'button.join': 'Join',
		'button.send': 'Send',
		'button.upload': 'Upload',
		'button.browse': 'Browse',
		
		// Status Messages
		'status.loading': 'Loading...',
		'status.saving': 'Saving...',
		'status.uploading': 'Uploading...',
		'status.processing': 'Processing...',
		'status.connecting': 'Connecting...',
		'status.disconnected': 'Disconnected',
		'status.connected': 'Connected',
		'status.online': 'Online',
		'status.offline': 'Offline',
		
		// Time and Dates
		'time.now': 'Now',
		'time.justNow': 'Just now',
		'time.minuteAgo': '1 minute ago',
		'time.minutesAgo': '{{count}} minutes ago',
		'time.hourAgo': '1 hour ago',
		'time.hoursAgo': '{{count}} hours ago',
		'time.dayAgo': '1 day ago',
		'time.daysAgo': '{{count}} days ago',
		
		// File Operations
		'file.select': 'Select file',
		'file.drop': 'Drop file here',
		'file.upload': 'Upload file',
		'file.remove': 'Remove file',
		'file.failedToRead': 'Failed to read file',
		'file.failedToUpload': 'Failed to upload file',
		
		// Development/Debug
		'dev.notImplemented': 'Not yet implemented',
		'dev.loadMore': 'Load more messages not yet implemented in WebSocket store',
		'dev.markAsRead': 'Mark messages as read not yet implemented in WebSocket store',
		'dev.joinByInvite': 'Join group by invite not yet implemented in WebSocket store'
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
		'success.settings.saved': 'Configuración guardada exitosamente.',
		
		// Footer
		'footer.followUs': 'Síguenos:',
		'footer.privacy': 'Política de Privacidad',
		'footer.terms': 'Términos de Servicio',
		'footer.security': 'Seguridad',
		'footer.contact': 'Contacto',
		
		// Chat
		'chat.title': 'Chat',
		'chat.newChat': 'Nuevo Chat',
		'chat.joinGroup': 'Unirse al Grupo',
		'chat.addParticipants': 'Agregar Participantes',
		'chat.selectConversation': 'Selecciona una conversación para comenzar a enviar mensajes',
		'chat.typeMessage': 'Escribe un mensaje...',
		'chat.sendMessage': 'Enviar mensaje',
		'chat.attachFile': 'Adjuntar archivo',
		'chat.noMessages': 'Aún no hay mensajes',
		'chat.noMessagesRoom': 'No hay mensajes en esta sala',
		'chat.unknownUser': 'Usuario Desconocido',
		'chat.unknownGroup': 'Grupo Desconocido',
		'chat.decrypting': 'Descifrando...',
		'chat.messageUnavailable': 'Contenido del mensaje no disponible',
		'chat.encryptedMessageFailed': 'Mensaje cifrado - falló el descifrado',
		
		// Modals
		'modal.close': 'Cerrar',
		'modal.closeModal': 'Cerrar modal',
		'modal.cancel': 'Cancelar',
		'modal.confirm': 'Confirmar',
		'modal.save': 'Guardar',
		'modal.create': 'Crear',
		'modal.add': 'Agregar',
		'modal.remove': 'Eliminar',
		'modal.delete': 'Borrar',
		
		// New Chat Modal
		'newChat.title': 'Nuevo Chat',
		'newChat.directMessage': 'Mensaje Directo',
		'newChat.group': 'Grupo',
		'newChat.channel': 'Canal',
		'newChat.searchUsers': 'Buscar usuarios...',
		'newChat.groupName': 'Nombre del Grupo',
		'newChat.groupNamePlaceholder': 'Ingresa el nombre del grupo',
		'newChat.startChat': 'Iniciar Chat',
		'newChat.createGroup': 'Crear Grupo',
		'newChat.createChannel': 'Crear Canal',
		'newChat.selectUsers': 'Por favor selecciona al menos un usuario',
		'newChat.enterGroupName': 'Por favor ingresa un nombre de grupo',
		'newChat.failedToCreate': 'Falló al crear la conversación',
		'newChat.removeUser': 'Eliminar usuario de la selección',
		
		// Add Participants Modal
		'addParticipants.title': 'Agregar Participantes',
		'addParticipants.search': 'Buscar usuarios...',
		'addParticipants.add': 'Agregar Participantes',
		'addParticipants.failedToSearch': 'Falló al buscar usuarios',
		'addParticipants.failedToAdd': 'Falló al agregar participantes',
		'addParticipants.successAdded': 'Participantes agregados exitosamente',
		
		// Settings
		'settings.title': 'Configuración',
		'settings.profile': 'Perfil',
		'settings.security': 'Seguridad',
		'settings.notifications': 'Notificaciones',
		'settings.appearance': 'Apariencia',
		'settings.privacy': 'Privacidad',
		'settings.advanced': 'Avanzado',
		'settings.failedToLoad': 'Falló al cargar la configuración',
		'settings.failedToSave': 'Falló al guardar la configuración',
		'settings.saved': 'Configuración guardada exitosamente',
		
		// Encryption Settings
		'encryption.title': 'Cifrado',
		'encryption.status': 'Estado del Cifrado',
		'encryption.enabled': 'Habilitado',
		'encryption.disabled': 'Deshabilitado',
		'encryption.generate': 'Generar Claves',
		'encryption.regenerate': 'Regenerar Claves',
		'encryption.failedToCheck': 'Falló al verificar el estado del cifrado',
		'encryption.failedToGenerate': 'Falló al generar las claves de cifrado',
		'encryption.failedToRegenerate': 'Falló al regenerar las claves de cifrado',
		
		// Private Key Manager
		'privateKey.title': 'Administrador de Claves Privadas',
		'privateKey.export': 'Exportar Claves Privadas',
		'privateKey.import': 'Importar Claves Privadas',
		'privateKey.password': 'Contraseña',
		'privateKey.confirmPassword': 'Confirmar Contraseña',
		'privateKey.enterPassword': 'Por favor ingresa una contraseña para proteger tus claves exportadas',
		'privateKey.passwordsNoMatch': 'Las contraseñas no coinciden',
		'privateKey.gpgPassword': 'Contraseña GPG',
		'privateKey.confirmGPGPassword': 'Confirmar Contraseña GPG',
		'privateKey.enterGPGPassword': 'Por favor ingresa una contraseña GPG para cifrado adicional',
		'privateKey.gpgPasswordsNoMatch': 'Las contraseñas GPG no coinciden',
		'privateKey.enableGPG': 'Habilitar cifrado GPG para seguridad adicional',
		'privateKey.exportPasswordPlaceholder': 'Ingresa una contraseña fuerte para proteger tus claves',
		'privateKey.confirmPasswordPlaceholder': 'Confirma tu contraseña',
		'privateKey.gpgPasswordPlaceholder': 'Ingresa una contraseña GPG fuerte',
		'privateKey.confirmGPGPasswordPlaceholder': 'Confirma tu contraseña GPG',
		'privateKey.selectFile': 'Por favor selecciona un archivo de claves para importar',
		'privateKey.enterImportPassword': 'Por favor ingresa la contraseña usada para proteger tus claves',
		'privateKey.importPasswordPlaceholder': 'Ingresa la contraseña usada para proteger tus claves',
		'privateKey.dropFile': 'Suelta el archivo de claves aquí o haz clic para seleccionar',
		'privateKey.failedToExport': 'Falló al exportar las claves privadas',
		'privateKey.failedToImport': 'Falló al importar las claves privadas',
		'privateKey.failedToRead': 'Falló al leer el archivo',
		
		// SMS Notifications
		'sms.title': 'Notificaciones SMS',
		'sms.enabled': 'Notificaciones SMS habilitadas',
		'sms.disabled': 'Notificaciones SMS deshabilitadas',
		'sms.userNotFound': 'Usuario no encontrado',
		'sms.updated': 'Preferencia de notificaciones SMS actualizada exitosamente',
		'sms.failedToUpdate': 'Falló al actualizar la preferencia de notificaciones SMS',
		
		// Status Messages
		'status.loading': 'Cargando...',
		'status.saving': 'Guardando...',
		'status.uploading': 'Subiendo...',
		'status.processing': 'Procesando...',
		'status.connecting': 'Conectando...',
		'status.disconnected': 'Desconectado',
		'status.connected': 'Conectado',
		'status.online': 'En línea',
		'status.offline': 'Sin conexión',
		
		// Aria Labels
		'aria.userMenu': 'Menú de usuario',
		'aria.toggleMobileMenu': 'Alternar menú móvil',
		'aria.closeModal': 'Cerrar modal',
		'aria.closeNotification': 'Cerrar notificación',
		'aria.dismissMessage': 'Descartar mensaje',
		'aria.removeUser': 'Eliminar usuario de la selección',
		'aria.attachFile': 'Adjuntar archivo',
		'aria.sendMessage': 'Enviar mensaje',
		'aria.newChat': 'Crear nuevo chat',
		'aria.joinGroup': 'Unirse a grupo existente',
		'aria.addParticipants': 'Agregar participantes a la conversación',
		'aria.changeAvatar': 'Cambiar foto de perfil',
		'aria.removeAvatar': 'Eliminar avatar',
		'aria.closeUpload': 'Cerrar subida de avatar',
		'aria.dropFile': 'Suelta el archivo de claves aquí o haz clic para seleccionar'
	},
	fr: {
		// Navigation
		'nav.home': 'Accueil',
		'nav.chat': 'Chat',
		'nav.settings': 'Paramètres',
		'nav.profile': 'Profil',
		'nav.logout': 'Déconnexion',
		'nav.login': 'Connexion',
		'nav.register': 'S\'inscrire',
		
		// Theme
		'theme.light': 'Clair',
		'theme.dark': 'Sombre',
		'theme.system': 'Système',
		'theme.switch': 'Changer de Thème',
		
		// Language
		'language.switch': 'Changer de Langue',
		'language.current': 'Langue Actuelle',
		
		// Common
		'common.loading': 'Chargement...',
		'common.error': 'Erreur',
		'common.success': 'Succès',
		'common.cancel': 'Annuler',
		'common.confirm': 'Confirmer',
		'common.save': 'Enregistrer',
		'common.delete': 'Supprimer',
		'common.edit': 'Modifier',
		'common.close': 'Fermer',
		'common.back': 'Retour',
		'common.next': 'Suivant',
		'common.previous': 'Précédent',
		'common.submit': 'Soumettre',
		'common.search': 'Rechercher',
		'common.filter': 'Filtrer',
		'common.sort': 'Trier',
		'common.refresh': 'Actualiser',
		
		// App
		'app.name': 'QryptChat',
		'app.tagline': 'Messagerie Résistante aux Quantiques',
		'app.description': 'Messagerie sécurisée, chiffrée de bout en bout et résistante aux quantiques',
		
		// Chat
		'chat.title': 'Chat',
		'chat.newChat': 'Nouveau Chat',
		'chat.joinGroup': 'Rejoindre le Groupe',
		'chat.addParticipants': 'Ajouter des Participants',
		'chat.selectConversation': 'Sélectionnez une conversation pour commencer à envoyer des messages',
		'chat.typeMessage': 'Tapez un message...',
		'chat.sendMessage': 'Envoyer le message',
		'chat.attachFile': 'Joindre un fichier',
		'chat.noMessages': 'Aucun message pour le moment',
		'chat.noMessagesRoom': 'Aucun message dans cette salle',
		'chat.unknownUser': 'Utilisateur Inconnu',
		'chat.unknownGroup': 'Groupe Inconnu',
		'chat.decrypting': 'Déchiffrement...',
		'chat.messageUnavailable': 'Contenu du message indisponible',
		'chat.encryptedMessageFailed': 'Message chiffré - échec du déchiffrement',
		
		// Add Participants Modal
		'addParticipants.title': 'Ajouter des Participants',
		'addParticipants.search': 'Rechercher des utilisateurs...',
		'addParticipants.add': 'Ajouter des Participants',
		'addParticipants.failedToSearch': 'Échec de la recherche d\'utilisateurs',
		'addParticipants.failedToAdd': 'Échec de l\'ajout de participants',
		
		// Status Messages
		'status.loading': 'Chargement...',
		'status.processing': 'Traitement...',
		
		// Aria Labels
		'aria.closeModal': 'Fermer la modal',
		'aria.newChat': 'Créer un nouveau chat',
		'aria.joinGroup': 'Rejoindre un groupe existant'
	},
	de: {
		// Navigation
		'nav.home': 'Startseite',
		'nav.chat': 'Chat',
		'nav.settings': 'Einstellungen',
		'nav.profile': 'Profil',
		'nav.logout': 'Abmelden',
		'nav.login': 'Anmelden',
		'nav.register': 'Registrieren',
		
		// Theme
		'theme.light': 'Hell',
		'theme.dark': 'Dunkel',
		'theme.system': 'System',
		'theme.switch': 'Design Wechseln',
		
		// Language
		'language.switch': 'Sprache Wechseln',
		'language.current': 'Aktuelle Sprache',
		
		// Common
		'common.loading': 'Laden...',
		'common.error': 'Fehler',
		'common.success': 'Erfolg',
		'common.cancel': 'Abbrechen',
		'common.confirm': 'Bestätigen',
		'common.save': 'Speichern',
		'common.delete': 'Löschen',
		'common.edit': 'Bearbeiten',
		'common.close': 'Schließen',
		'common.back': 'Zurück',
		'common.next': 'Weiter',
		'common.previous': 'Vorherige',
		'common.submit': 'Senden',
		'common.search': 'Suchen',
		'common.filter': 'Filtern',
		'common.sort': 'Sortieren',
		'common.refresh': 'Aktualisieren',
		
		// App
		'app.name': 'QryptChat',
		'app.tagline': 'Quantenresistente Nachrichten',
		'app.description': 'Sichere, quantenresistente Ende-zu-Ende-verschlüsselte Nachrichten',
		
		// Chat
		'chat.title': 'Chat',
		'chat.newChat': 'Neuer Chat',
		'chat.joinGroup': 'Gruppe Beitreten',
		'chat.addParticipants': 'Teilnehmer Hinzufügen',
		'chat.selectConversation': 'Wählen Sie eine Unterhaltung aus, um mit dem Senden von Nachrichten zu beginnen',
		'chat.typeMessage': 'Nachricht eingeben...',
		'chat.sendMessage': 'Nachricht senden',
		'chat.attachFile': 'Datei anhängen',
		'chat.noMessages': 'Noch keine Nachrichten',
		'chat.noMessagesRoom': 'Keine Nachrichten in diesem Raum',
		'chat.unknownUser': 'Unbekannter Benutzer',
		'chat.unknownGroup': 'Unbekannte Gruppe',
		'chat.decrypting': 'Entschlüsseln...',
		'chat.messageUnavailable': 'Nachrichteninhalt nicht verfügbar',
		'chat.encryptedMessageFailed': 'Verschlüsselte Nachricht - Entschlüsselung fehlgeschlagen',
		
		// Add Participants Modal
		'addParticipants.title': 'Teilnehmer Hinzufügen',
		'addParticipants.search': 'Benutzer suchen...',
		'addParticipants.add': 'Teilnehmer Hinzufügen',
		'addParticipants.failedToSearch': 'Benutzersuche fehlgeschlagen',
		'addParticipants.failedToAdd': 'Hinzufügen von Teilnehmern fehlgeschlagen',
		
		// Status Messages
		'status.loading': 'Laden...',
		'status.processing': 'Verarbeitung...',
		
		// Aria Labels
		'aria.closeModal': 'Modal schließen',
		'aria.newChat': 'Neuen Chat erstellen',
		'aria.joinGroup': 'Bestehender Gruppe beitreten'
	},
	ar: {
		// Navigation
		'nav.home': 'الرئيسية',
		'nav.chat': 'المحادثة',
		'nav.settings': 'الإعدادات',
		'nav.profile': 'الملف الشخصي',
		'nav.logout': 'تسجيل الخروج',
		'nav.login': 'تسجيل الدخول',
		'nav.register': 'التسجيل',
		
		// Theme
		'theme.light': 'فاتح',
		'theme.dark': 'داكن',
		'theme.system': 'النظام',
		'theme.switch': 'تغيير المظهر',
		
		// Language
		'language.switch': 'تغيير اللغة',
		'language.current': 'اللغة الحالية',
		
		// Common
		'common.loading': 'جاري التحميل...',
		'common.error': 'خطأ',
		'common.success': 'نجح',
		'common.cancel': 'إلغاء',
		'common.confirm': 'تأكيد',
		'common.save': 'حفظ',
		'common.delete': 'حذف',
		'common.edit': 'تعديل',
		'common.close': 'إغلاق',
		'common.back': 'رجوع',
		'common.next': 'التالي',
		'common.previous': 'السابق',
		'common.submit': 'إرسال',
		'common.search': 'بحث',
		'common.filter': 'تصفية',
		'common.sort': 'ترتيب',
		'common.refresh': 'تحديث',
		
		// App
		'app.name': 'QryptChat',
		'app.tagline': 'مراسلة مقاومة للكم',
		'app.description': 'مراسلة آمنة ومشفرة من طرف إلى طرف ومقاومة للكم',
		
		// Chat
		'chat.title': 'المحادثة',
		'chat.newChat': 'محادثة جديدة',
		'chat.joinGroup': 'انضمام للمجموعة',
		'chat.addParticipants': 'إضافة مشاركين',
		'chat.selectConversation': 'اختر محادثة لبدء إرسال الرسائل',
		'chat.typeMessage': 'اكتب رسالة...',
		'chat.sendMessage': 'إرسال الرسالة',
		'chat.attachFile': 'إرفاق ملف',
		'chat.noMessages': 'لا توجد رسائل بعد',
		'chat.noMessagesRoom': 'لا توجد رسائل في هذه الغرفة',
		'chat.unknownUser': 'مستخدم غير معروف',
		'chat.unknownGroup': 'مجموعة غير معروفة',
		'chat.decrypting': 'جاري فك التشفير...',
		'chat.messageUnavailable': 'محتوى الرسالة غير متاح',
		'chat.encryptedMessageFailed': 'رسالة مشفرة - فشل في فك التشفير',
		
		// Add Participants Modal
		'addParticipants.title': 'إضافة مشاركين',
		'addParticipants.search': 'البحث عن المستخدمين...',
		'addParticipants.add': 'إضافة مشاركين',
		'addParticipants.failedToSearch': 'فشل في البحث عن المستخدمين',
		'addParticipants.failedToAdd': 'فشل في إضافة المشاركين',
		
		// Status Messages
		'status.loading': 'جاري التحميل...',
		'status.processing': 'جاري المعالجة...',
		
		// Aria Labels
		'aria.closeModal': 'إغلاق النافذة المنبثقة',
		'aria.newChat': 'إنشاء محادثة جديدة',
		'aria.joinGroup': 'الانضمام إلى مجموعة موجودة'
	},
	zh: {
		// Navigation
		'nav.home': '首页',
		'nav.chat': '聊天',
		'nav.settings': '设置',
		'nav.profile': '个人资料',
		'nav.logout': '登出',
		'nav.login': '登录',
		'nav.register': '注册',
		
		// Theme
		'theme.light': '浅色',
		'theme.dark': '深色',
		'theme.system': '系统',
		'theme.switch': '切换主题',
		
		// Language
		'language.switch': '切换语言',
		'language.current': '当前语言',
		
		// Common
		'common.loading': '加载中...',
		'common.error': '错误',
		'common.success': '成功',
		'common.cancel': '取消',
		'common.confirm': '确认',
		'common.save': '保存',
		'common.delete': '删除',
		'common.edit': '编辑',
		'common.close': '关闭',
		'common.back': '返回',
		'common.next': '下一个',
		'common.previous': '上一个',
		'common.submit': '提交',
		'common.search': '搜索',
		'common.filter': '筛选',
		'common.sort': '排序',
		'common.refresh': '刷新',
		
		// App
		'app.name': 'QryptChat',
		'app.tagline': '抗量子消息传递',
		'app.description': '安全的抗量子端到端加密消息传递',
		
		// Chat
		'chat.title': '聊天',
		'chat.newChat': '新聊天',
		'chat.joinGroup': '加入群组',
		'chat.addParticipants': '添加参与者',
		'chat.selectConversation': '选择一个对话开始发送消息',
		'chat.typeMessage': '输入消息...',
		'chat.sendMessage': '发送消息',
		'chat.attachFile': '附加文件',
		'chat.noMessages': '暂无消息',
		'chat.noMessagesRoom': '此房间暂无消息',
		'chat.unknownUser': '未知用户',
		'chat.unknownGroup': '未知群组',
		'chat.decrypting': '解密中...',
		'chat.messageUnavailable': '消息内容不可用',
		'chat.encryptedMessageFailed': '加密消息 - 解密失败',
		
		// Add Participants Modal
		'addParticipants.title': '添加参与者',
		'addParticipants.search': '搜索用户...',
		'addParticipants.add': '添加参与者',
		'addParticipants.failedToSearch': '搜索用户失败',
		'addParticipants.failedToAdd': '添加参与者失败',
		
		// Status Messages
		'status.loading': '加载中...',
		'status.processing': '处理中...',
		
		// Aria Labels
		'aria.closeModal': '关闭模态框',
		'aria.newChat': '创建新聊天',
		'aria.joinGroup': '加入现有群组'
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