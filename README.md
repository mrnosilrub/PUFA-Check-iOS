PUFA Check — Expo (SDK 53) iOS App
Minimal, TestFlight-ready Expo app scaffold for scanning grocery barcodes and flagging high-PUFA (seed oil) content.
Note: The Project body had a conflicting SDK value (51 vs 53). This project targets Expo SDK 53 per the “Project Properties”. Update if needed.
Quickstart
# install
npm install

# run locally with Expo Go (iOS)
npx expo start
# then open the QR in Expo Go on your iPhone
What’s included
Tabs: Home, History, Settings
Stack: Home → Scan → Result, History → Result
expo-camera wired with a minimal barcode scanner
expo-haptics feedback on successful scans
AsyncStorage for local history/favorites
High-contrast dark UI with accent #24D3A8
Build in the cloud with EAS
1) Configure app identifiers
In app.json:
ios.bundleIdentifier → com.{yourname}.pufa-check (change {yourname})
extra.eas.projectId → TODO: paste the EAS Project ID from expo.dev
In eas.json:
submit.production.ios.ascAppId → TODO: paste App Store Connect App ID (from your App record)
2) Log in and initialize
npx expo login
npx eas login
npx eas build:configure
3) iOS build (internal preview)
npx eas build --platform ios --profile preview
This produces an .ipa you can install via EAS or TestFlight (if you’ve connected ASC).
4) Production build & optional auto-submit
# when ready for TestFlight:
npx eas build --platform ios --profile production

# Optional: submit the latest iOS build
npx eas submit --platform ios --latest
TestFlight submission notes
Create the app in App Store Connect first (name, Bundle ID, SKU).
Ensure NSCameraUsageDescription is present (already included in app.json).
Invite internal testers after the first build is processed.
Add metadata (subtitle, keywords, screenshots) before external testing.
Next steps (data)
Connect to OpenFoodFacts or USDA FoodData Central for product + fat profile details.
Persist enriched results to AsyncStorage (and later, cloud backup).
Scripts
npm start — run via Expo
Repo hygiene
Edit .gitignore if you add tooling artifacts (Xcode, etc.).
Known TODOs
Fill EAS Project ID and ascAppId.
Replace bundleIdentifier with your real identifier.
Hook up product lookups & PUFA analysis to a real API.