import type { Locale } from "@storyteller/localization";

const copies = {
  en: {
    scenes: "Scenes", addScene: "Add scene", scene: "Scene", emptyScene: "Start by adding a photo or video",
    materials: "Materials", addMaterial: "Upload materials", uploadingMaterials: "Uploading {{count}}…",
    portrait: "Portrait", landscape: "Landscape", silent: "Silent", audioUnclassified: "Audio needs labels", voice: "Voice", music: "Music", ambient: "Background sound",
    layout: "Layout", layoutHint: "Options follow the orientation sequence", motion: "Movement", duration: "Duration",
    seconds: "sec", preview: "Scene preview",
    zoomIn: "Zoom in", zoomOut: "Zoom out", panLeft: "Move left", panRight: "Move right", noMotion: "No added motion",
    creatingScene: "Creating scene…", emptyPipelineHint: "No scenes yet. Add one in the pipeline on the left.",
    sceneCreateError: "Could not create the scene. Check that the API is running and try again.", operationError: "The change was not saved. Try again.",
    uploadTooLarge: "The file is larger than the allowed upload size.", uploadUnsupported: "This photo or video format is not supported.",
    uploadUnreadable: "The photo or video could not be read. Check that the file plays and try again.",
    fileInfo: "File information", fileName: "Name", fileSize: "Size", fileFormat: "Format", fileDimensions: "Dimensions", fileDuration: "Duration", sourceAudio: "Source audio",
    sceneDebug: "Scene debug data", materialActions: "Material actions", editMaterial: "Edit material", cropMaterial: "Crop", trimMaterial: "Trim video",
    deleteMaterial: "Delete material", deleteMaterialConfirmation: "Delete “{{name}}” from this scene? The uploaded file will also be deleted.", cancel: "Cancel",
    materialEditorHint: "Non-destructive editing tools will be added here.", dragMaterial: "Reorder material {{number}}", dragMaterialHint: "Drag to reorder. Use the arrow keys with a keyboard.", close: "Close",
    createScene: "Create scene", createCover: "Create cover", coverEditorPending: "The cover will open in a separate editor later.",
    storyStart: "Start of the story", storyEnd: "End of the story", noScenes: "No scenes yet", sceneEdgeHint: "Continue the story or prepare its cover.",
    sceneCarousel: "Story scenes", swipeScenes: "Swipe left or right to change scenes", sceneTools: "Scene tools",
    allStories: "All stories", untitledStory: "Untitled story", saving: "Saving", saved: "Saved", openScene: "Open scene",
  },
  ru: {
    scenes: "Сцены", addScene: "Добавить сцену", scene: "Сцена", emptyScene: "Добавьте фотографию или видео",
    materials: "Материалы", addMaterial: "Загрузить материалы", uploadingMaterials: "Загружаем: {{count}}…",
    portrait: "Портрет", landscape: "Альбом", silent: "Без звука", audioUnclassified: "Звук нужно разметить", voice: "Голос", music: "Музыка", ambient: "Фоновый звук",
    layout: "Композиция", layoutHint: "Варианты зависят от последовательности ориентаций", motion: "Движение", duration: "Длительность",
    seconds: "сек", preview: "Предпросмотр сцены",
    zoomIn: "Зум ин", zoomOut: "Зум аут", panLeft: "Движение влево", panRight: "Движение вправо", noMotion: "Без движения",
    creatingScene: "Создаём сцену…", emptyPipelineHint: "Сцен пока нет. Добавьте сцену в pipeline слева.",
    sceneCreateError: "Не удалось создать сцену. Проверьте, что API запущен, и попробуйте ещё раз.", operationError: "Изменение не сохранилось. Попробуйте ещё раз.",
    uploadTooLarge: "Файл превышает допустимый размер загрузки.", uploadUnsupported: "Этот формат фотографии или видео не поддерживается.",
    uploadUnreadable: "Не удалось прочитать фотографию или видео. Проверьте, что файл воспроизводится, и попробуйте ещё раз.",
    fileInfo: "Информация о файле", fileName: "Название", fileSize: "Размер", fileFormat: "Формат", fileDimensions: "Разрешение", fileDuration: "Длительность", sourceAudio: "Исходный звук",
    sceneDebug: "Отладочные данные сцены", materialActions: "Действия с материалом", editMaterial: "Редактировать материал", cropMaterial: "Кадрировать", trimMaterial: "Обрезать видео",
    deleteMaterial: "Удалить материал", deleteMaterialConfirmation: "Удалить «{{name}}» из сцены? Загруженный файл также будет удалён.", cancel: "Отмена",
    materialEditorHint: "Здесь появятся инструменты неразрушающего редактирования.", dragMaterial: "Изменить порядок материала {{number}}", dragMaterialHint: "Перетащите для изменения порядка. С клавиатуры используйте стрелки.", close: "Закрыть",
    createScene: "Создать сцену", createCover: "Создать обложку", coverEditorPending: "Обложка позже откроется в отдельном редакторе.",
    storyStart: "Начало истории", storyEnd: "Конец истории", noScenes: "Сцен пока нет", sceneEdgeHint: "Продолжите историю или подготовьте её обложку.",
    sceneCarousel: "Сцены истории", swipeScenes: "Смахните влево или вправо, чтобы сменить сцену", sceneTools: "Инструменты сцены",
    allStories: "Все истории", untitledStory: "История без названия", saving: "Сохраняем", saved: "Сохранено", openScene: "Открыть сцену",
  },
  "sr-Latn": {
    scenes: "Scene", addScene: "Dodaj scenu", scene: "Scena", emptyScene: "Dodajte fotografiju ili video",
    materials: "Materijali", addMaterial: "Otpremi materijale", uploadingMaterials: "Otpremanje: {{count}}…",
    portrait: "Portret", landscape: "Pejzaž", silent: "Bez zvuka", audioUnclassified: "Zvuk treba označiti", voice: "Glas", music: "Muzika", ambient: "Pozadinski zvuk",
    layout: "Raspored", layoutHint: "Opcije prate redosled orijentacija", motion: "Kretanje", duration: "Trajanje",
    seconds: "sek", preview: "Pregled scene",
    zoomIn: "Zumiraj", zoomOut: "Odumiraj", panLeft: "Kretanje levo", panRight: "Kretanje desno", noMotion: "Bez dodatnog kretanja",
    creatingScene: "Kreiranje scene…", emptyPipelineHint: "Još nema scena. Dodajte scenu u pipeline-u levo.",
    sceneCreateError: "Scena nije kreirana. Proverite da li API radi i pokušajte ponovo.", operationError: "Promena nije sačuvana. Pokušajte ponovo.",
    uploadTooLarge: "Datoteka prelazi dozvoljenu veličinu otpremanja.", uploadUnsupported: "Ovaj format fotografije ili videa nije podržan.",
    uploadUnreadable: "Fotografija ili video nisu mogli da se pročitaju. Proverite da li se datoteka reprodukuje i pokušajte ponovo.",
    fileInfo: "Informacije o datoteci", fileName: "Naziv", fileSize: "Veličina", fileFormat: "Format", fileDimensions: "Dimenzije", fileDuration: "Trajanje", sourceAudio: "Izvorni zvuk",
    sceneDebug: "Podaci scene za otklanjanje grešaka", materialActions: "Radnje materijala", editMaterial: "Uredi materijal", cropMaterial: "Iseci kadar", trimMaterial: "Skrati video",
    deleteMaterial: "Obriši materijal", deleteMaterialConfirmation: "Obrisati „{{name}}“ iz scene? Otpremljena datoteka će takođe biti obrisana.", cancel: "Otkaži",
    materialEditorHint: "Ovde će biti dodati alati za nedestruktivno uređivanje.", dragMaterial: "Promeni redosled materijala {{number}}", dragMaterialHint: "Prevucite za promenu redosleda. Koristite strelice na tastaturi.", close: "Zatvori",
    createScene: "Napravi scenu", createCover: "Napravi naslovnicu", coverEditorPending: "Naslovnica će se kasnije otvarati u posebnom editoru.",
    storyStart: "Početak priče", storyEnd: "Kraj priče", noScenes: "Još nema scena", sceneEdgeHint: "Nastavite priču ili pripremite naslovnicu.",
    sceneCarousel: "Scene priče", swipeScenes: "Prevucite levo ili desno za promenu scene", sceneTools: "Alati scene",
    allStories: "Sve priče", untitledStory: "Priča bez naslova", saving: "Čuvanje", saved: "Sačuvano", openScene: "Otvori scenu",
  },
} as const;

export type EditorCopy = { readonly [Key in keyof typeof copies.en]: string };
export function getEditorCopy(locale: Locale): EditorCopy { return copies[locale]; }

export function getEditorOperationError(copy: EditorCopy, error: unknown): string {
  const status = typeof error === "object" && error !== null && "status" in error ? error.status : undefined;
  if (status === 413) return copy.uploadTooLarge;
  if (status === 415) return copy.uploadUnsupported;
  if (status === 422) return copy.uploadUnreadable;
  return copy.operationError;
}
