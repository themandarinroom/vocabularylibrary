// Public web configuration, scoped to this Solo artifact. No environment switch.
export const SOLO_PROJECT = 'the-mandarin-room';
const expected = Object.freeze({
  apiKey: 'AIzaSyAFqL3XTgZaL-w2G0UIJ3TVTqY1j1n7y24',
  authDomain: 'the-mandarin-room.firebaseapp.com',
  projectId: SOLO_PROJECT,
  storageBucket: 'the-mandarin-room.firebasestorage.app',
  messagingSenderId: '940574313978',
  appId: '1:940574313978:web:24db38b28ec255c63de843'
});
export function installSoloRuntime(target = globalThis) {
  const prior = target.__TMR_FIREBASE_RUNTIME__;
  if (prior && (Object.keys(prior).some(key => key !== 'firebaseConfig') ||
    !prior.firebaseConfig || Object.keys(prior.firebaseConfig).length !== Object.keys(expected).length ||
    Object.entries(expected).some(([key, value]) => prior.firebaseConfig[key] !== value))) {
    throw new Error('Solo requires its exact Production configuration. No alternate environment is allowed.');
  }
  const runtime = Object.freeze({ firebaseConfig: expected });
  Object.defineProperty(target, '__TMR_FIREBASE_RUNTIME__', { value: runtime, writable: false, configurable: false });
  return runtime;
}
export function assertSoloRuntime(target = globalThis) {
  const runtime = target.__TMR_FIREBASE_RUNTIME__;
  if (!runtime || Object.entries(expected).some(([key, value]) => runtime.firebaseConfig?.[key] !== value) ||
      Object.keys(runtime.firebaseConfig).length !== Object.keys(expected).length ||
      Object.keys(runtime).some(key => key !== 'firebaseConfig')) throw new Error('Solo Production configuration changed.');
  return runtime.firebaseConfig;
}
installSoloRuntime();
