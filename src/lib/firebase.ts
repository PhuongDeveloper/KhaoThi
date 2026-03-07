import { initializeApp } from 'firebase/app'
import { getAuth, setPersistence, browserLocalPersistence } from 'firebase/auth'
import { getFirestore } from 'firebase/firestore'
import { getStorage } from 'firebase/storage'

export const firebaseConfig = {
  apiKey: 'AIzaSyDJ70ETjbOh114bEFN0YVD5LQSxNXH7pHc',
  authDomain: 'khao-thi-online.firebaseapp.com',
  projectId: 'khao-thi-online',
  storageBucket: 'khao-thi-online.firebasestorage.app',
  messagingSenderId: '803646372551',
  appId: '1:803646372551:web:d26c143625878a7bc61ce2',
  measurementId: 'G-S3RH7DTHMR',
}

// Initialize Firebase
const app = initializeApp(firebaseConfig)

// Firebase services
export const auth = getAuth(app)
export const db = getFirestore(app)
export const storage = getStorage(app)

// Lưu trạng thái đăng nhập vào localStorage (persistent qua tab/browser close)
setPersistence(auth, browserLocalPersistence).catch(() => {
  // Ignore nếu không hỗ trợ
})

