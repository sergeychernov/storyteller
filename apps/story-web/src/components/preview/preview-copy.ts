import type { Locale } from "@storyteller/localization";

const copies = {
  en: {
    back: "Back to editor", play: "Play", pause: "Pause",
    scene: "Scene", canvas: "Current canvas", loading: "Loading preview…", loadingScene: "Loading scene {{number}}…",
    ready: "Ready", paused: "Paused", buffering: "Buffering…", failed: "This scene could not be played.", retry: "Retry",
    completed: "Preview completed", noPlayableScenes: "There are no non-empty scenes to play.", totalDuration: "Total duration",
    emptyScenes: "Empty scenes: {{count}}", limitExceeded: "{{format}} limit exceeded by {{duration}}",
    changed: "The story changed. Preview was reset; press Play to start the current revision.", loadError: "Could not load the story preview.",
    exportTitle: "Story master", exportProfile: "1080×1920 · MP4 · vertical social", exportProgress: "Master export progress",
    exportStart: "Build master", exportRetry: "Build again", exportDownload: "Download MP4", exportReadyToStart: "Every scene renders in parallel, then joins the story music into one master.",
    exportRendering: "Rendering scenes: {{ready}} of {{total}} ready.", exportAssembling: "Joining the scenes and the music…", exportReady: "Master is ready at {{fps}} FPS.",
    exportStale: "The story changed. Build a master for the current version.", exportSoundtrackFailed: "The story music could not be added to the master. Create the music again.", exportEmptyScene: "Fill every scene before building the master.",
    exportSegmentFailed: "One of the scene segments failed. Retry to keep completed work.", exportUnknownError: "The master could not be built.",
  },
  ru: {
    back: "В редактор", play: "Воспроизвести", pause: "Пауза",
    scene: "Сцена", canvas: "Текущий canvas", loading: "Загружаем просмотр…", loadingScene: "Загружаем сцену {{number}}…",
    ready: "Готово", paused: "Пауза", buffering: "Буферизация…", failed: "Не удалось воспроизвести эту сцену.", retry: "Повторить",
    completed: "Просмотр завершён", noPlayableScenes: "В истории нет непустых сцен для просмотра.", totalDuration: "Общая длительность",
    emptyScenes: "Пустые сцены: {{count}}", limitExceeded: "Лимит {{format}} превышен на {{duration}}",
    changed: "История изменилась. Просмотр сброшен; нажмите Play, чтобы запустить актуальную версию.", loadError: "Не удалось загрузить просмотр истории.",
    exportTitle: "Мастер истории", exportProfile: "1080×1920 · MP4 · vertical social", exportProgress: "Прогресс сборки мастера",
    exportStart: "Собрать мастер", exportRetry: "Собрать заново", exportDownload: "Скачать MP4", exportReadyToStart: "Все сцены отрендерятся параллельно, затем соединятся с музыкой истории.",
    exportRendering: "Рендерим сцены: готово {{ready}} из {{total}}.", exportAssembling: "Соединяем сцены и музыку…", exportReady: "Мастер готов, {{fps}} FPS.",
    exportStale: "История изменилась. Соберите мастер актуальной версии.", exportSoundtrackFailed: "Музыку истории не удалось добавить в мастер. Создайте музыку заново.", exportEmptyScene: "Заполните все сцены перед сборкой мастера.",
    exportSegmentFailed: "Не удалось отрендерить одну из сцен. Повтор сохранит уже готовую работу.", exportUnknownError: "Не удалось собрать мастер.",
  },
  "sr-Latn": {
    back: "Nazad u uređivač", play: "Pusti", pause: "Pauza",
    scene: "Scena", canvas: "Aktuelno platno", loading: "Učitavanje pregleda…", loadingScene: "Učitavanje scene {{number}}…",
    ready: "Spremno", paused: "Pauzirano", buffering: "Učitavanje…", failed: "Ova scena ne može da se reprodukuje.", retry: "Pokušaj ponovo",
    completed: "Pregled je završen", noPlayableScenes: "Nema nepraznih scena za reprodukciju.", totalDuration: "Ukupno trajanje",
    emptyScenes: "Prazne scene: {{count}}", limitExceeded: "Ograničenje {{format}} je prekoračeno za {{duration}}",
    changed: "Priča je promenjena. Pregled je vraćen na početak; pritisnite Play za aktuelnu verziju.", loadError: "Pregled priče nije mogao da se učita.",
    exportTitle: "Master priče", exportProfile: "1080×1920 · MP4 · vertical social", exportProgress: "Napredak izvoza mastera",
    exportStart: "Napravi master", exportRetry: "Napravi ponovo", exportDownload: "Preuzmi MP4", exportReadyToStart: "Sve scene se renderuju paralelno, a zatim se spajaju sa muzikom priče.",
    exportRendering: "Renderovanje scena: {{ready}} od {{total}} spremno.", exportAssembling: "Spajanje scena i muzike…", exportReady: "Master je spreman na {{fps}} FPS.",
    exportStale: "Priča je promenjena. Napravite master aktuelne verzije.", exportSoundtrackFailed: "Muziku priče nije moguće dodati u master. Napravite muziku ponovo.", exportEmptyScene: "Popunite svaku scenu pre izrade mastera.",
    exportSegmentFailed: "Jedan segment scene nije uspeo. Ponovite bez gubitka završenog rada.", exportUnknownError: "Master nije mogao da se napravi.",
  },
  es: {
    back: "Volver al editor", play: "Reproducir", pause: "Pausar",
    scene: "Escena", canvas: "Lienzo actual", loading: "Cargando la vista previa…", loadingScene: "Cargando la escena {{number}}…",
    ready: "Lista", paused: "Pausada", buffering: "Cargando…", failed: "No se pudo reproducir esta escena.", retry: "Reintentar",
    completed: "Vista previa completada", noPlayableScenes: "No hay escenas con contenido para reproducir.", totalDuration: "Duración total",
    emptyScenes: "Escenas vacías: {{count}}", limitExceeded: "El límite de {{format}} se supera por {{duration}}",
    changed: "La historia cambió. La vista previa se reinició; pulsa Reproducir para iniciar la versión actual.", loadError: "No se pudo cargar la vista previa de la historia.",
    exportTitle: "Máster de la historia", exportProfile: "1080×1920 · MP4 · vertical social", exportProgress: "Progreso del máster",
    exportStart: "Crear máster", exportRetry: "Crear de nuevo", exportDownload: "Descargar MP4", exportReadyToStart: "Todas las escenas se renderizan en paralelo y luego se unen con la música de la historia.",
    exportRendering: "Renderizando escenas: {{ready}} de {{total}} listas.", exportAssembling: "Uniendo las escenas y la música…", exportReady: "El máster está listo a {{fps}} FPS.",
    exportStale: "La historia cambió. Crea un máster de la versión actual.", exportSoundtrackFailed: "La música no se pudo añadir al máster. Crea la música de nuevo.", exportEmptyScene: "Completa todas las escenas antes de crear el máster.",
    exportSegmentFailed: "Falló un segmento. Reintenta sin perder el trabajo terminado.", exportUnknownError: "No se pudo crear el máster.",
  },
} as const;

export type PreviewCopy = { readonly [Key in keyof typeof copies.en]: string };
export function getPreviewCopy(locale: Locale): PreviewCopy { return copies[locale]; }
export function interpolatePreviewCopy(template: string, values: Readonly<Record<string, string | number>>): string {
  return Object.entries(values).reduce((result, [key, value]) => result.replaceAll(`{{${key}}}`, String(value)), template);
}
