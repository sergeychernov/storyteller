import type { Locale } from "@storyteller/localization";

const copies = {
  en: {
    eyebrow: "A story worth telling",
    title: "Your moments.", accent: "A story of their own.",
    description: "Turn your photos and videos into stories worth sharing. We’re building a path to YouTube with your voice and music — from a web studio to your phone and AI assistants.",
    enterStudio: "Open the studio", earlyAccess: "In development · explore the current studio",
    roadmap: "Product roadmap", roadmapIntro: "See what’s next for your stories.",
    current: "We are here", planned: "Ahead", complete: "Complete", allComplete: "All milestones complete",
    tasks: "tasks complete", scopePending: "Scope being defined",
    progressNote: "Development progress based on completed tasks.",
    updated: "Updated with every site release.",
  },
  ru: {
    eyebrow: "Истории, которые хочется рассказать",
    title: "Ваши моменты.", accent: "Ваша история.",
    description: "Превращайте фото и видео в истории, которыми хочется делиться. Мы создаём путь до YouTube с вашим голосом и музыкой — от веб-студии до приложения в телефоне и AI-ассистентов.",
    enterStudio: "Открыть студию", earlyAccess: "В разработке · попробуйте текущую версию студии",
    roadmap: "Product roadmap", roadmapIntro: "Больше возможностей для ваших историй.",
    current: "Мы здесь", planned: "Впереди", complete: "Готово", allComplete: "Все milestones завершены",
    tasks: "задач закрыто", scopePending: "Состав задач уточняется",
    progressNote: "Прогресс разработки по завершённым задачам.",
    updated: "Обновляется с каждым релизом сайта.",
  },
  "sr-Latn": {
    eyebrow: "Priče koje vredi ispričati",
    title: "Vaši trenuci.", accent: "Vaša priča.",
    description: "Pretvorite fotografije i video u priče koje vredi podeliti. Gradimo put do YouTube-a uz vaš glas i muziku — od veb-studija do telefona i AI asistenata.",
    enterStudio: "Otvori studio", earlyAccess: "U razvoju · isprobajte trenutnu verziju studija",
    roadmap: "Product roadmap", roadmapIntro: "Više mogućnosti za vaše priče.",
    current: "Ovde smo", planned: "Sledi", complete: "Završeno", allComplete: "Svi milestones su završeni",
    tasks: "zadataka završeno", scopePending: "Zadaci se definišu",
    progressNote: "Napredak razvoja prema završenim zadacima.",
    updated: "Ažurira se sa svakim izdanjem sajta.",
  },
} satisfies Record<Locale, Record<string, string>>;

export type PublicSiteCopy = { readonly [Key in keyof typeof copies.en]: string };
export function getPublicSiteCopy(locale: Locale): PublicSiteCopy { return copies[locale]; }
