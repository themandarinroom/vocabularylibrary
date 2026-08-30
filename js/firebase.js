import { firebaseConfig } from "./firebase-config.js";

const FIREBASE_VERSION = "12.16.0";
let servicesPromise;

export function getFirebaseServices() {
  if (!servicesPromise) {
    servicesPromise = Promise.all([
      import(`https://www.gstatic.com/firebasejs/${FIREBASE_VERSION}/firebase-app.js`),
      import(`https://www.gstatic.com/firebasejs/${FIREBASE_VERSION}/firebase-auth.js`),
      import(`https://www.gstatic.com/firebasejs/${FIREBASE_VERSION}/firebase-firestore.js`),
      import(`https://www.gstatic.com/firebasejs/${FIREBASE_VERSION}/firebase-storage.js`),
      import(`https://www.gstatic.com/firebasejs/${FIREBASE_VERSION}/firebase-functions.js`)
    ]).then(([appSdk, authSdk, firestoreSdk, storageSdk, functionsSdk]) => {
      const app = appSdk.initializeApp(firebaseConfig);
      return { app, auth: authSdk.getAuth(app), db: firestoreSdk.getFirestore(app), storage: storageSdk.getStorage(app), functions: functionsSdk.getFunctions(app, "australia-southeast1"), authSdk, firestoreSdk, storageSdk, functionsSdk };
    });
  }
  return servicesPromise;
}
