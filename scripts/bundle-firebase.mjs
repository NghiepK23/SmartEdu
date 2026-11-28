import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import esbuild from 'esbuild';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const outFile = path.join(rootDir, 'js', 'vendor', 'firebase-sdk.min.js');

/* Tệp này CHỈ đóng gói thư viện Firebase, không nhúng cấu hình dự án.
   Cấu hình nằm ở firebase-applet-config.json (gitignore), được server.js phục vụ tại
   /firebase-applet-config.json và js/03-firebase.js nạp bằng fetch. Nhờ vậy không có
   khóa API nào nằm trong mã nguồn hay trong tệp build, và git không báo rò rỉ. */

const entrySource = `
import { initializeApp } from 'firebase/app';
import {
  getAuth,
  onAuthStateChanged,
  signInWithPopup,
  GoogleAuthProvider,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  updatePassword,
  sendEmailVerification,
  signOut,
  updateProfile,
  EmailAuthProvider,
  reauthenticateWithCredential
} from 'firebase/auth';
import {
  getFirestore,
  collection,
  doc,
  getDoc,
  getDocFromServer,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  addDoc,
  query,
  where,
  orderBy,
  limit,
  writeBatch,
  serverTimestamp,
  arrayUnion,
  arrayRemove,
  onSnapshot
} from 'firebase/firestore';
import {
  getStorage,
  ref,
  uploadBytesResumable,
  getDownloadURL,
  deleteObject
} from 'firebase/storage';

const sdk = {
  initializeApp,
  getAuth,
  getFirestore,
  getStorage,
  auth,
  db,
  storage,
  authApi: {
    onAuthStateChanged,
    signInWithPopup,
    GoogleAuthProvider,
    signInWithEmailAndPassword,
    createUserWithEmailAndPassword,
    sendPasswordResetEmail,
    updatePassword,
    sendEmailVerification,
    signOut,
    updateProfile,
    EmailAuthProvider,
    reauthenticateWithCredential
  },
  firestoreApi: {
    collection,
    doc,
    getDoc,
    getDocFromServer,
    getDocs,
    setDoc,
    updateDoc,
    deleteDoc,
    addDoc,
    query,
    where,
    orderBy,
    limit,
    writeBatch,
    serverTimestamp,
    arrayUnion,
    arrayRemove,
    onSnapshot
  },
  storageApi: {
    ref,
    uploadBytesResumable,
    getDownloadURL,
    deleteObject
  }
};

if (typeof window !== 'undefined') {
  window.EducMindFirebase = sdk;
}
`;

fs.mkdirSync(path.dirname(outFile), { recursive: true });

await esbuild.build({
  stdin: {
    contents: entrySource,
    resolveDir: rootDir,
    sourcefile: 'firebase-sdk-entry.js',
    loader: 'js',
  },
  bundle: true,
  minify: true,
  format: 'iife',
  target: ['es2020'],
  outfile: outFile,
  define: {
    'process.env.NODE_ENV': '"production"',
  },
});

console.log('Generated', path.relative(rootDir, outFile), '(' + fs.statSync(outFile).size + ' bytes)');
