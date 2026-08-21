import { StatusBar } from "expo-status-bar";
import { Pressable, SafeAreaView, ScrollView, StyleSheet, Text, View } from "react-native";
import { localeOptions, useLocalization } from "./localization";

export default function HomeScreen() {
  const { locale, setLocale, t } = useLocalization();
  const stories = [
    { title: t("mobile.story.beijing"), sceneCount: 6, status: t("common.status.draft"), color: "#dce9b9" },
    { title: t("mobile.story.sea"), sceneCount: 12, status: t("common.status.ready"), color: "#cbdce7" },
  ];

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar style="dark" />
      <ScrollView contentContainerStyle={styles.page}>
        <View style={styles.header}>
          <View><Text style={styles.brand}>Storyteller</Text><Text style={styles.kicker}>{t("mobile.companion")}</Text></View>
          <View style={styles.avatar}><Text style={styles.avatarText}>SC</Text></View>
        </View>

        <View accessibilityLabel={t("language.label")} style={styles.languageRow}>
          {localeOptions.map((option) => (
            <Pressable key={option.locale} onPress={() => setLocale(option.locale)} style={[styles.languageButton, locale === option.locale && styles.languageButtonActive]}>
              <Text style={[styles.languageText, locale === option.locale && styles.languageTextActive]}>{option.shortLabel}</Text>
            </Pressable>
          ))}
        </View>

        <View style={styles.hero}>
          <Text style={styles.heroLabel}>{t("mobile.hero.label")}</Text>
          <Text style={styles.heroTitle}>{t("mobile.hero.title")}</Text>
          <Text style={styles.heroCopy}>{t("mobile.hero.copy")}</Text>
        </View>

        <View style={styles.sectionHead}><Text style={styles.sectionTitle}>{t("mobile.recent")}</Text><Text style={styles.link}>{t("mobile.viewAll")}</Text></View>
        {stories.map((story) => (
          <Pressable key={story.title} style={styles.storyCard}>
            <View style={[styles.thumbnail, { backgroundColor: story.color }]}><Text style={styles.thumbnailText}>{story.title[0]}</Text></View>
            <View style={styles.storyText}><Text style={styles.storyTitle}>{story.title}</Text><Text style={styles.storyMeta}>{t("mobile.sceneCount", { count: story.sceneCount })} · {story.status}</Text></View>
            <Text style={styles.arrow}>›</Text>
          </Pressable>
        ))}

        <Pressable style={styles.createButton}><Text style={styles.createText}>{t("mobile.createStory")}</Text></Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: "#f3f1eb" },
  page: { padding: 22, paddingBottom: 48 },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 42 },
  brand: { color: "#1c1c18", fontSize: 22, fontWeight: "700", letterSpacing: -0.8 },
  kicker: { color: "#8b8a80", fontSize: 8, letterSpacing: 1.6, marginTop: 3 },
  languageRow: { flexDirection: "row", alignSelf: "flex-end", backgroundColor: "#e5e2d9", borderRadius: 10, padding: 3, marginTop: -28, marginBottom: 18 },
  languageButton: { borderRadius: 7, paddingHorizontal: 11, paddingVertical: 7 },
  languageButtonActive: { backgroundColor: "#20201c" },
  languageText: { color: "#77766c", fontSize: 10, fontWeight: "700" },
  languageTextActive: { color: "#d9f47b" },
  avatar: { width: 38, height: 38, borderRadius: 19, backgroundColor: "#20201c", alignItems: "center", justifyContent: "center" },
  avatarText: { color: "#d9f47b", fontSize: 11, fontWeight: "600" },
  hero: { backgroundColor: "#20201c", borderRadius: 22, padding: 26, marginBottom: 34 },
  heroLabel: { color: "#a8a89d", fontSize: 9, letterSpacing: 1.8, marginBottom: 18 },
  heroTitle: { color: "#f6f4ed", fontSize: 38, lineHeight: 40, fontWeight: "600", letterSpacing: -1.8 },
  heroCopy: { color: "#aaa99f", fontSize: 14, lineHeight: 21, marginTop: 18 },
  sectionHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 13 },
  sectionTitle: { fontSize: 21, fontWeight: "600", color: "#22221e", letterSpacing: -0.5 },
  link: { color: "#71813f", fontSize: 13, fontWeight: "600" },
  storyCard: { flexDirection: "row", alignItems: "center", backgroundColor: "#fff", borderRadius: 14, padding: 10, marginBottom: 10 },
  thumbnail: { width: 60, height: 68, borderRadius: 9, alignItems: "center", justifyContent: "center" },
  thumbnailText: { color: "#505844", fontFamily: "Georgia", fontSize: 27 },
  storyText: { flex: 1, marginLeft: 14 },
  storyTitle: { color: "#272722", fontSize: 15, fontWeight: "600" },
  storyMeta: { color: "#95948a", fontSize: 11, marginTop: 6 },
  arrow: { color: "#9b9a91", fontSize: 28, marginRight: 8 },
  createButton: { borderWidth: 1, borderStyle: "dashed", borderColor: "#bcb9ae", borderRadius: 14, padding: 18, alignItems: "center", marginTop: 6 },
  createText: { color: "#66655d", fontSize: 14, fontWeight: "600" },
});
