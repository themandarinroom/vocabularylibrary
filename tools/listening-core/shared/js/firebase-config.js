// Solo-scoped config; existing applications retain their own unchanged config.
import { assertSoloRuntime } from '../solo-runtime-config.mjs';
export const firebaseConfig = assertSoloRuntime();
export const firebaseAppCheckConfig = null;
