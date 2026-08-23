import type { Locale } from "@storyteller/localization";

const copies = {
  en: {
    scenes: "Scenes", addScene: "Add scene", scene: "Scene", emptyScene: "Start by adding a photo or video",
    materialOrder: "Materials · order matters", addMaterial: "Upload materials", uploadingMaterials: "Uploading {{count}}…",
    portrait: "Portrait", landscape: "Landscape", silent: "Silent", audioUnclassified: "Audio needs labels", voice: "Voice", music: "Music", ambient: "Background sound",
    layout: "Layout", layoutHint: "Options follow the orientation sequence", motion: "Movement", duration: "Duration",
    seconds: "sec", preview: "Scene preview",
    zoomIn: "Zoom in", zoomOut: "Zoom out", panLeft: "Move left", panRight: "Move right", noMotion: "No added motion",
    creatingScene: "Creating scene…", emptyPipelineHint: "No scenes yet. Add one in the pipeline on the left.",
    sceneCreateError: "Could not create the scene. Check that the API is running and try again.", operationError: "The change was not saved. Try again.",
  },
  ru: {
    scenes: "Сцены", addScene: "Добавить сцену", scene: "Сцена", emptyScene: "Добавьте фотографию или видео",
    materialOrder: "Материалы · порядок важен", addMaterial: "Загрузить материалы", uploadingMaterials: "Загружаем: {{count}}…",
    portrait: "Портрет", landscape: "Альбом", silent: "Без звука", audioUnclassified: "Звук нужно разметить", voice: "Голос", music: "Музыка", ambient: "Фоновый звук",
    layout: "Layout", layoutHint: "Варианты зависят от последовательности ориентаций", motion: "Движение", duration: "Длительность",
    seconds: "сек", preview: "Предпросмотр сцены",
    zoomIn: "Зум ин", zoomOut: "Зум аут", panLeft: "Движение влево", panRight: "Движение вправо", noMotion: "Без движения",
    creatingScene: "Создаём сцену…", emptyPipelineHint: "Сцен пока нет. Добавьте сцену в pipeline слева.",
    sceneCreateError: "Не удалось создать сцену. Проверьте, что API запущен, и попробуйте ещё раз.", operationError: "Изменение не сохранилось. Попробуйте ещё раз.",
  },
  "sr-Latn": {
    scenes: "Scene", addScene: "Dodaj scenu", scene: "Scena", emptyScene: "Dodajte fotografiju ili video",
    materialOrder: "Materijali · redosled je važan", addMaterial: "Otpremi materijale", uploadingMaterials: "Otpremanje: {{count}}…",
    portrait: "Portret", landscape: "Pejzaž", silent: "Bez zvuka", audioUnclassified: "Zvuk treba označiti", voice: "Glas", music: "Muzika", ambient: "Pozadinski zvuk",
    layout: "Raspored", layoutHint: "Opcije prate redosled orijentacija", motion: "Kretanje", duration: "Trajanje",
    seconds: "sek", preview: "Pregled scene",
    zoomIn: "Zumiraj", zoomOut: "Odumiraj", panLeft: "Kretanje levo", panRight: "Kretanje desno", noMotion: "Bez dodatnog kretanja",
    creatingScene: "Kreiranje scene…", emptyPipelineHint: "Još nema scena. Dodajte scenu u pipeline-u levo.",
    sceneCreateError: "Scena nije kreirana. Proverite da li API radi i pokušajte ponovo.", operationError: "Promena nije sačuvana. Pokušajte ponovo.",
  },
} as const;

export type EditorCopy = { readonly [Key in keyof typeof copies.en]: string };
export function getEditorCopy(locale: Locale): EditorCopy { return copies[locale]; }
