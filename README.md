# PUFA Check

An iOS app built with Expo SDK 51 that helps users identify seed oils and high‑PUFA foods by scanning barcodes.

## Running the app

- Install dependencies: `npm install` or `yarn install`.
- Run on device: `npx expo start` and use the Expo Go app to scan the QR code.
- Build in the cloud with EAS:
  - Install EAS CLI: `npm install -g eas-cli`.
  - Create an EAS project: `eas init` and set the `projectId` in `app.json`.
  - Build preview: `eas build --platform ios --profile preview`.
  - To submit to TestFlight (once `ascAppId` is set in `eas.json`): `eas submit --platform ios`.

## Notes

- This project currently supports iOS only. Android configuration is intentionally omitted.
- Make sure to set your own Bundle ID, EAS project ID, and ascAppId in `app.json` and `eas.json`.
- The scan screen uses `expo-camera` and `expo-haptics`. It saves scan history locally with `@react-native-async-storage/async-storage`.
