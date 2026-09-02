import type { Locale } from "@storyteller/localization";

const copies = {
  en: {
    back: "Back to editor", play: "Play", pause: "Pause", soundOn: "Sound on", soundOff: "Sound off",
    scene: "Scene", canvas: "Current canvas", loading: "Loading preview…", loadingScene: "Loading scene {{number}}…",
    ready: "Ready", paused: "Paused", buffering: "Buffering…", failed: "This scene could not be played.", retry: "Retry",
    completed: "Preview completed", noPlayableScenes: "There are no non-empty scenes to play.", totalDuration: "Total duration",
    emptyScenes: "Empty scenes: {{count}}", limitExceeded: "{{format}} limit exceeded by {{duration}}",
    changed: "The story changed. Preview was reset; press Play to start the current revision.", loadError: "Could not load the story preview.",
  },
  ru: {
    back: "В редактор", play: "Воспроизвести", pause: "Пауза", soundOn: "Включить звук", soundOff: "Выключить звук",
    scene: "Сцена", canvas: "Текущий canvas", loading: "Загружаем просмотр…", loadingScene: "Загружаем сцену {{number}}…",
    ready: "Готово", paused: "Пауза", buffering: "Буферизация…", failed: "Не удалось воспроизвести эту сцену.", retry: "Повторить",
    completed: "Просмотр завершён", noPlayableScenes: "В истории нет непустых сцен для просмотра.", totalDuration: "Общая длительность",
    emptyScenes: "Пустые сцены: {{count}}", limitExceeded: "Лимит {{format}} превышен на {{duration}}",
    changed: "История изменилась. Просмотр сброшен; нажмите Play, чтобы запустить актуальную версию.", loadError: "Не удалось загрузить просмотр истории.",
  },
  "sr-Latn": {
    back: "Nazad u uređivač", play: "Pusti", pause: "Pauza", soundOn: "Uključi zvuk", soundOff: "Isključi zvuk",
    scene: "Scena", canvas: "Aktuelno platno", loading: "Učitavanje pregleda…", loadingScene: "Učitavanje scene {{number}}…",
    ready: "Spremno", paused: "Pauzirano", buffering: "Učitavanje…", failed: "Ova scena ne može da se reprodukuje.", retry: "Pokušaj ponovo",
    completed: "Pregled je završen", noPlayableScenes: "Nema nepraznih scena za reprodukciju.", totalDuration: "Ukupno trajanje",
    emptyScenes: "Prazne scene: {{count}}", limitExceeded: "Ograničenje {{format}} je prekoračeno za {{duration}}",
    changed: "Priča je promenjena. Pregled je vraćen na početak; pritisnite Play za aktuelnu verziju.", loadError: "Pregled priče nije mogao da se učita.",
  },
  es: {
    back: "Volver al editor", play: "Reproducir", pause: "Pausar", soundOn: "Activar sonido", soundOff: "Silenciar",
    scene: "Escena", canvas: "Lienzo actual", loading: "Cargando la vista previa…", loadingScene: "Cargando la escena {{number}}…",
    ready: "Lista", paused: "Pausada", buffering: "Cargando…", failed: "No se pudo reproducir esta escena.", retry: "Reintentar",
    completed: "Vista previa completada", noPlayableScenes: "No hay escenas con contenido para reproducir.", totalDuration: "Duración total",
    emptyScenes: "Escenas vacías: {{count}}", limitExceeded: "El límite de {{format}} se supera por {{duration}}",
    changed: "La historia cambió. La vista previa se reinició; pulsa Reproducir para iniciar la versión actual.", loadError: "No se pudo cargar la vista previa de la historia.",
  },
} as const;

export type PreviewCopy = { readonly [Key in keyof typeof copies.en]: string };
export function getPreviewCopy(locale: Locale): PreviewCopy { return copies[locale]; }
export function interpolatePreviewCopy(template: string, values: Readonly<Record<string, string | number>>): string {
  return Object.entries(values).reduce((result, [key, value]) => result.replaceAll(`{{${key}}}`, String(value)), template);
}
