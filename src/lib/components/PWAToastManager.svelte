<script>
	import { onMount } from 'svelte';
	import ToastContainer from './ToastContainer.svelte';
	
	let installToastVisible = false;
	let updateToastVisible = false;
	let installHandler = null;
	let updateHandler = null;
	
	onMount(() => {
		// Listen for PWA install available event
		const handleInstallAvailable = (event) => {
			installHandler = event.detail.install;
			installToastVisible = true;
		};
		
		// Listen for PWA update available event
		const handleUpdateAvailable = (event) => {
			updateHandler = event.detail.update;
			updateToastVisible = true;
		};
		
		// Listen for PWA installed event
		const handleInstalled = () => {
			installToastVisible = false;
		};
		
		window.addEventListener('pwa-install-available', handleInstallAvailable);
		window.addEventListener('pwa-update-available', handleUpdateAvailable);
		window.addEventListener('pwa-installed', handleInstalled);
		
		return () => {
			window.removeEventListener('pwa-install-available', handleInstallAvailable);
			window.removeEventListener('pwa-update-available', handleUpdateAvailable);
			window.removeEventListener('pwa-installed', handleInstalled);
		};
	});
	
	function handleInstallAccept() {
		if (installHandler) {
			installHandler();
		}
		installToastVisible = false;
	}
	
	function handleInstallDismiss() {
		installToastVisible = false;
	}
	
	function handleUpdateAccept() {
		if (updateHandler) {
			updateHandler();
		}
		updateToastVisible = false;
	}
	
	function handleUpdateDismiss() {
		updateToastVisible = false;
	}
</script>

<!-- Install Toast -->
<ToastContainer
	type="install"
	title="Install QryptChat"
	message="Get the full app experience with offline support"
	visible={installToastVisible}
	onAccept={handleInstallAccept}
	onDismiss={handleInstallDismiss}
	acceptText="Install"
	dismissText="Later"
/>

<!-- Update Toast -->
<ToastContainer
	type="update"
	title="Update Available"
	message="A new version of QryptChat is ready"
	visible={updateToastVisible}
	onAccept={handleUpdateAccept}
	onDismiss={handleUpdateDismiss}
	acceptText="Update"
	dismissText="Later"
/>