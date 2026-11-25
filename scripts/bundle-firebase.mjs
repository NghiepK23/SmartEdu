import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import esbuild from 'esbuild';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const configPath = path.join(rootDir, 'firebase-applet-config.json');
const outFile = path.join(rootDir, 'js', 'vendor', 'firebase-sdk.min.js');

if (!fs.existsSync(configPath)) {
  throw new Error('Missing firebase-applet-config.json');
}
const firebaseConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));

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

const firebaseConfig = ${JSON.stringify(firebaseConfig)};
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = firebaseConfig.firestoreDatabaseId
  ? getFirestore(app, firebaseConfig.firestoreDatabaseId)
  : getFirestore(app);
const storage = getStorage(app);

const sdk = {
  firebaseConfig,
  app,
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
