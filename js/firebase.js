import { firebaseAppCheckConfig, firebaseConfig } from "./firebase-config.js";

const FIREBASE_VERSION = "12.16.0";
let servicesPromise;

export function getFirebaseServices() {
  if (!servicesPromise) {
    servicesPromise = Promise.all([
      import(`https://www.gstatic.com/firebasejs/${FIREBASE_VERSION}/firebase-app.js`),
      import(`https://www.gstatic.com/firebasejs/${FIREBASE_VERSION}/firebase-auth.js`),
      import(`https://www.gstatic.com/firebasejs/${FIREBASE_VERSION}/firebase-firestore.js`),
      import(`https://www.gstatic.com/firebasejs/${FIREBASE_VERSION}/firebase-storage.js`),
      import(`https://www.gstatic.com/firebasejs/${FIREBASE_VERSION}/firebase-functions.js`),
      firebaseAppCheckConfig ? import(`https://www.gstatic.com/firebasejs/${FIREBASE_VERSION}/firebase-app-check.js`) : Promise.resolve(null)
    ]).then(([appSdk, authSdk, firestoreSdk, storageSdk, functionsSdk, appCheckSdk]) => {
      const app = appSdk.initializeApp(firebaseConfig);
      const appCheck = appCheckSdk ? appCheckSdk.initializeAppCheck(app, { provider: new appCheckSdk.ReCaptchaEnterpriseProvider(firebaseAppCheckConfig.siteKey), isTokenAutoRefreshEnabled: true }) : null;
      return { app, appCheck, auth: authSdk.getAuth(app), db: firestoreSdk.getFirestore(app), storage: storageSdk.getStorage(app), functions: functionsSdk.getFunctions(app, "australia-southeast1"), authSdk, firestoreSdk, storageSdk, functionsSdk, appCheckSdk };
    });
  }
  return servicesPromise;
}
