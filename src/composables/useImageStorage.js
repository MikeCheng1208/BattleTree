const DB_NAME = 'battletree-images'
const DB_VERSION = 1
const STORE_NAME = 'images'

function openImageDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)

    request.onupgradeneeded = () => {
      request.result.createObjectStore(STORE_NAME)
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

async function withStore(mode, callback) {
  const db = await openImageDb()
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, mode)
    const store = transaction.objectStore(STORE_NAME)
    const request = callback(store)

    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
    transaction.oncomplete = () => db.close()
    transaction.onerror = () => {
      db.close()
      reject(transaction.error)
    }
  })
}

export function getStoredImage(key) {
  return withStore('readonly', (store) => store.get(key))
}

export function setStoredImage(key, file) {
  return withStore('readwrite', (store) => store.put(file, key))
}

export function removeStoredImage(key) {
  return withStore('readwrite', (store) => store.delete(key))
}

export function createImageUrl(blob) {
  return blob ? URL.createObjectURL(blob) : ''
}
