import { Stack } from "expo-router";
import { LocalizationProvider } from "./localization";

export default function RootLayout() {
  return <LocalizationProvider><Stack screenOptions={{ headerShown: false }} /></LocalizationProvider>;
}
