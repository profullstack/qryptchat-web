/**
 * @fileoverview IndexedDB manager for storing cryptographic keys securely.
 */

const DB_NAME = 'QryptChatKeys';
const DB_VERSION = 1;
const STORE_NAME = 'keypairs';

class IndexedDBManager {
	/** @type {IDBDatabase | null} */
	db = null;

	/**
	 * @returns {Promise<IDBDatabase>}
	 */
	async openDB() {
		if (this.db) {
			return this.db;
		}

		return new Promise((resolve, reject) => {
			const request = indexedDB.open(DB_NAME, DB_VERSION);

			request.onupgradeneeded = (event) => {
				const db = /** @type {IDBOpenDBRequest} */ (event.target).result;
				db.createObjectStore(STORE_NAME, { keyPath: 'id' });
			};

			request.onsuccess = (event) => {
				this.db = /** @type {IDBOpenDBRequest} */ (event.target).result;
				resolve(this.db);
			};

			request.onerror = (event) => {
				reject('Error opening IndexedDB: ' + /** @type {IDBOpenDBRequest} */ (event.target).error);
			};
		});
	}

	/**
	 * @param {string} id
	 * @param {any} value
	 * @returns {Promise<void>}
	 */
	async set(id, value) {
		const db = await this.openDB();
		return new Promise((resolve, reject) => {
			const transaction = db.transaction([STORE_NAME], 'readwrite');
			const store = transaction.objectStore(STORE_NAME);
			const request = store.put({ id, value });

			request.onsuccess = () => {
				resolve(undefined);
			};

			request.onerror = (event) => {
				reject('Error saving to IndexedDB: ' + /** @type {IDBRequest} */ (event.target).error);
			};
		});
	}

	/**
	 * @param {string} id
	 * @returns {Promise<any>}
	 */
	async get(id) {
		const db = await this.openDB();
		return new Promise((resolve, reject) => {
			const transaction = db.transaction([STORE_NAME], 'readonly');
			const store = transaction.objectStore(STORE_NAME);
			const request = store.get(id);

			request.onsuccess = (event) => {
				const target = /** @type {IDBRequest} */ (event.target);
				resolve(target.result ? target.result.value : null);
			};

			request.onerror = (event) => {
				reject('Error reading from IndexedDB: ' + /** @type {IDBRequest} */ (event.target).error);
			};
		});
	}

	/**
	 * @param {string} id
	 * @returns {Promise<void>}
	 */
	async delete(id) {
		const db = await this.openDB();
		return new Promise((resolve, reject) => {
			const transaction = db.transaction([STORE_NAME], 'readwrite');
			const store = transaction.objectStore(STORE_NAME);
			const request = store.delete(id);

			request.onsuccess = () => {
				resolve(undefined);
			};

			request.onerror = (event) => {
				reject('Error deleting from IndexedDB: ' + /** @type {IDBRequest} */ (event.target).error);
			};
		});
	}
}

export const indexedDBManager = new IndexedDBManager();
