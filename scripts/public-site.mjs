export const publicSiteOrigin = "https://makeitastory.app";

const shared = {
  en: {
    code: "en",
    hrefLang: "en",
    ogLocale: "en_US",
    languageName: "English",
    skipToContent: "Skip to content",
    brandTagline: "Guided video storytelling",
    nav: { home: "Home", travel: "Travel stories", personal: "Personal stories", features: "Features" },
    openStudio: "Open the studio",
    earlyAccess: "Early access · the studio is actively being built",
    secondaryCta: "See how it works",
    illustrativeExample: "Illustrative workflow — no customer identity or private media is used.",
    finalTitle: "Your materials already hold a story.",
    finalBody: "Bring the photos and clips. Make It a Story helps you shape the meaning, sequence and voice — while the final decisions stay yours.",
    footer: "Make meaningful video stories from the moments you already captured.",
    roadmap: "Product roadmap",
    roadmapIntro: "See what’s next for your stories.",
    current: "We are here",
    planned: "Ahead",
    complete: "Complete",
    allComplete: "All milestones complete",
    tasks: "tasks complete",
    scopePending: "Scope being defined",
    progressNote: "Development progress based on completed tasks. Dates are estimates and may change.",
    updated: "Updated with every site release.",
  },
  ru: {
    code: "ru",
    hrefLang: "ru",
    ogLocale: "ru_RU",
    languageName: "Русский",
    skipToContent: "Перейти к содержанию",
    brandTagline: "Студия осмысленных видеоисторий",
    nav: { home: "Главная", travel: "Путешествия", personal: "Личные истории", features: "Возможности" },
    openStudio: "Открыть студию",
    earlyAccess: "Ранний доступ · мы активно развиваем студию",
    secondaryCta: "Как это работает",
    illustrativeExample: "Иллюстративный сценарий — без чужих личных данных и закрытых материалов.",
    finalTitle: "В ваших материалах уже есть история.",
    finalBody: "Добавьте фото и видео. Make It a Story поможет выстроить смысл, порядок и голос — а все финальные решения останутся за вами.",
    footer: "Создавайте осмысленные видеоистории из моментов, которые уже сняли.",
    roadmap: "Product roadmap",
    roadmapIntro: "Больше возможностей для ваших историй.",
    current: "Мы здесь",
    planned: "Впереди",
    complete: "Готово",
    allComplete: "Все milestones завершены",
    tasks: "задач закрыто",
    scopePending: "Состав задач уточняется",
    progressNote: "Прогресс разработки по завершённым задачам. Сроки ориентировочные и могут измениться.",
    updated: "Обновляется с каждым релизом сайта.",
  },
  "sr-Latn": {
    code: "sr",
    hrefLang: "sr-Latn",
    ogLocale: "sr_RS",
    languageName: "Srpski",
    skipToContent: "Pređi na sadržaj",
    brandTagline: "Studio za smislene video-priče",
    nav: { home: "Početna", travel: "Putovanja", personal: "Lične priče", features: "Mogućnosti" },
    openStudio: "Otvori studio",
    earlyAccess: "Rani pristup · aktivno razvijamo studio",
    secondaryCta: "Kako funkcioniše",
    illustrativeExample: "Ilustrativni tok rada — bez tuđih privatnih podataka i materijala.",
    finalTitle: "U vašim materijalima već postoji priča.",
    finalBody: "Dodajte fotografije i snimke. Make It a Story pomaže da oblikujete smisao, redosled i glas — a konačne odluke ostaju vaše.",
    footer: "Pravite smislene video-priče od trenutaka koje ste već zabeležili.",
    roadmap: "Product roadmap",
    roadmapIntro: "Više mogućnosti za vaše priče.",
    current: "Ovde smo",
    planned: "Sledi",
    complete: "Završeno",
    allComplete: "Svi milestones su završeni",
    tasks: "zadataka završeno",
    scopePending: "Zadaci se definišu",
    progressNote: "Napredak razvoja prema završenim zadacima. Rokovi su okvirni i mogu se promeniti.",
    updated: "Ažurira se sa svakim izdanjem sajta.",
  },
};

const pagesByLocale = {
  en: [
    {
      key: "home",
      path: "/",
      seoTitle: "AI video story maker for your photos and clips | Make It a Story",
      seoDescription: "Turn real photos and videos into a meaningful narrated story. A guided AI-assisted studio where your voice, materials and final decisions stay yours.",
      hero: {
        eyebrow: "Your memories, shaped with intention",
        title: "Not a photo dump.",
        accent: "A story told by you.",
        description: "Turn photos and clips from a trip, celebration or ordinary life into a coherent video story with your own voice and music — without starting from an empty editing timeline.",
      },
      proofPoints: ["Your real materials", "Your voice and point of view", "A finished story you approve"],
      sections: [
        {
          eyebrow: "Why it feels different",
          title: "The story comes before the effects.",
          intro: "Most tools begin with a template or a blank timeline. Make It a Story begins by understanding what happened, what matters and who the story is for.",
          items: [
            { title: "Guided, not generic", body: "A short creative brief helps turn a folder of media into a clear arc instead of a random montage." },
            { title: "AI as an editorial assistant", body: "AI can suggest structure, captions and pacing. It does not replace your memories or invent the meaning for you." },
            { title: "Approval at every meaningful step", body: "You review the story, visuals, voice and music before a final version is prepared or published." },
          ],
        },
        {
          eyebrow: "From raw material to a story",
          title: "A calm, guided workflow.",
          intro: "You do not need to learn professional editing software to make deliberate creative choices.",
          items: [
            { title: "1. Bring the moments", body: "Upload the photos and videos you want to remember. Originals remain the source of truth." },
            { title: "2. Find the through-line", body: "Answer a few questions about the people, turning points, mood and intended audience." },
            { title: "3. Shape and approve", body: "Review the proposed sequence, narration, titles, sound and final delivery before it leaves the studio." },
          ],
        },
      ],
      related: ["travel", "personal", "features"],
      showRoadmap: true,
    },
    {
      key: "travel",
      path: "/travel-stories",
      seoTitle: "Turn travel photos into a narrated video story | Make It a Story",
      seoDescription: "Transform travel photos and clips into a coherent trip story with narration, music and a structure you approve — without mastering a video editor.",
      hero: {
        eyebrow: "For trips worth remembering",
        title: "Your camera roll has the journey.",
        accent: "Give it a story.",
        description: "Bring together landscapes, short clips, small details and the moments between them. Build a travel story that sounds like you — not a generic highlight reel.",
      },
      proofPoints: ["Hundreds of mixed photos and clips", "A narrative, not just chronology", "Ready for family, friends or YouTube"],
      sections: [
        {
          eyebrow: "A common travel problem",
          title: "The trip ends. The media pile stays.",
          intro: "The best moments are spread across devices, and choosing what matters becomes a second job. A guided brief helps separate the story from the archive.",
          items: [
            { title: "Keep the turning points", body: "Arrival, surprises, people and changes in mood become anchors for the story." },
            { title: "Use details with purpose", body: "Food, streets, tickets and weather support the narrative instead of becoming filler." },
            { title: "Tell it in your own voice", body: "Record the memories only you know, then review how narration and original sound work together." },
          ],
        },
        {
          eyebrow: "Illustrative scenario",
          title: "Ten days in Georgia, distilled into one evening’s story.",
          intro: "A fictional example: 340 photos, 28 short clips and voice notes become chapters — anticipation, the mountain road, an unexpected dinner and the quiet trip home.",
          items: [
            { title: "Start with meaning", body: "The author chooses: this is a story about hospitality, not a list of landmarks." },
            { title: "Build a deliberate arc", body: "The studio suggests scenes and pacing; the author moves, removes and rewrites before approval." },
            { title: "Prepare the chosen version", body: "Only the approved edit, narration, music and destination belong to the final delivery." },
          ],
        },
      ],
      related: ["home", "features", "personal"],
    },
    {
      key: "personal",
      path: "/personal-video-stories",
      seoTitle: "Make a personal video story from family photos | Make It a Story",
      seoDescription: "Create a thoughtful personal or family video story from photos, clips and your narration. Guided structure, human approval and no generic slideshow feel.",
      hero: {
        eyebrow: "For the moments that belong to people",
        title: "More than a slideshow.",
        accent: "A memory with a point of view.",
        description: "Shape birthdays, family chapters, a year abroad or an ordinary season into a personal video story that preserves context — including the details only you can tell.",
      },
      proofPoints: ["Family and personal archives", "Context in your own words", "Private by default until you choose otherwise"],
      sections: [
        {
          eyebrow: "Personal, by design",
          title: "Meaning cannot be inferred from a face alone.",
          intro: "Dates and image recognition are useful, but they do not know why a moment matters. The workflow asks you, then uses your answers to organize the material.",
          items: [
            { title: "Preserve the context", body: "Names, relationships, jokes and turning points can guide the edit without being guessed from the media." },
            { title: "Choose the audience", body: "A story for grandparents needs a different rhythm and explanation than one prepared for a public channel." },
            { title: "Keep control of sharing", body: "Preparing a story does not make it public. Publication requires a separate, explicit choice." },
          ],
        },
        {
          eyebrow: "Illustrative scenario",
          title: "A child’s first year, told through the family’s small discoveries.",
          intro: "A fictional example combines monthly photos, short home videos and a parent’s narration around changes the camera alone cannot explain.",
          items: [
            { title: "Choose a through-line", body: "Instead of one clip per month, the story follows how the family learned a new everyday life." },
            { title: "Let voices carry memory", body: "Short narration adds the missing names, emotions and context while original sound keeps moments alive." },
            { title: "Review before sharing", body: "The family checks every scene and decides whether the result stays private or is prepared for a chosen audience." },
          ],
        },
      ],
      related: ["home", "features", "travel"],
    },
    {
      key: "features",
      path: "/features",
      seoTitle: "Guided AI video storytelling features | Make It a Story",
      seoDescription: "Explore a story-first workflow for organizing real media, shaping a narrative, adding your voice, reviewing creative choices and preparing an approved video.",
      hero: {
        eyebrow: "A studio that guides without taking over",
        title: "Creative help where it matters.",
        accent: "Control where it counts.",
        description: "Make It a Story combines a structured brief, visual editing and AI-assisted suggestions so you can move from a crowded media folder to an intentional story.",
      },
      proofPoints: ["Story-first workflow", "Non-destructive source media", "Explicit review before delivery"],
      sections: [
        {
          eyebrow: "The workflow",
          title: "One connected path from brief to final review.",
          intro: "The product is in early access. Capabilities are released step by step, and the public product roadmap below shows what is available and what comes next.",
          items: [
            { title: "Brief and story direction", body: "Define the audience, central idea, mood and important moments before committing to an edit." },
            { title: "Scenes and visual structure", body: "Arrange real photos and clips into scenes, adjust framing and preserve the original archive." },
            { title: "Voice, titles and sound", body: "Prepare narration, text and music as versioned creative choices rather than irreversible automation." },
            { title: "Review and approval", body: "See what will be delivered, approve the exact version and keep publication as a separate decision." },
            { title: "AI-assisted suggestions", body: "Ask for possible story structure, titles or pacing while retaining the ability to edit or reject every suggestion." },
            { title: "Multiple ways to create", body: "The product roadmap expands the same storytelling process from the web studio to mobile and AI assistants." },
          ],
        },
      ],
      related: ["travel", "personal", "home"],
      showRoadmap: true,
    },
  ],
  ru: [
    {
      key: "home",
      path: "/ru",
      seoTitle: "Видеоистории из фото и видео с AI | Make It a Story",
      seoDescription: "Превратите свои фото и видео в осмысленную историю с голосом и музыкой. AI помогает с монтажом, а материалы и финальные решения остаются вашими.",
      hero: {
        eyebrow: "Ваши воспоминания — с вашим смыслом",
        title: "Не клип из фото.",
        accent: "История, рассказанная вами.",
        description: "Превратите фото и видео из путешествия, праздника или обычной жизни в цельную историю со своим голосом и музыкой — без пустого таймлайна и изучения профессионального монтажа.",
      },
      proofPoints: ["Ваши настоящие материалы", "Ваш голос и точка зрения", "Готовая история после вашего одобрения"],
      sections: [
        {
          eyebrow: "В чём отличие",
          title: "Сначала история. Потом эффекты.",
          intro: "Большинство инструментов начинают с шаблона или пустого таймлайна. Make It a Story сначала помогает понять, что произошло, почему это важно и для кого вы рассказываете.",
          items: [
            { title: "Направляет, а не штампует", body: "Короткий творческий бриф превращает папку с материалами в ясную сюжетную линию, а не случайную нарезку." },
            { title: "AI как редакционный помощник", body: "AI предлагает структуру, титры и темп, но не подменяет ваши воспоминания и не придумывает их смысл." },
            { title: "Одобрение на важных этапах", body: "Вы проверяете сюжет, визуальный ряд, голос и музыку до подготовки или публикации финальной версии." },
          ],
        },
        {
          eyebrow: "От материалов к истории",
          title: "Спокойный и понятный процесс.",
          intro: "Чтобы принимать осмысленные творческие решения, не нужно осваивать профессиональный видеоредактор.",
          items: [
            { title: "1. Добавьте моменты", body: "Загрузите фото и видео, которые хотите сохранить. Оригиналы остаются источником истины." },
            { title: "2. Найдите главную мысль", body: "Ответьте на несколько вопросов о людях, поворотных моментах, настроении и будущих зрителях." },
            { title: "3. Соберите и одобрите", body: "Проверьте порядок, озвучку, титры, звук и итоговую доставку до выхода истории из студии." },
          ],
        },
      ],
      related: ["travel", "personal", "features"],
      showRoadmap: true,
    },
    {
      key: "travel",
      path: "/ru/istorii-o-puteshestviyah",
      seoTitle: "История путешествия из фото и видео | Make It a Story",
      seoDescription: "Соберите фото и видео из поездки в цельную историю с озвучкой, музыкой и понятным сюжетом — без освоения сложного видеоредактора.",
      hero: {
        eyebrow: "Для поездок, которые хочется помнить",
        title: "В галерее остался маршрут.",
        accent: "Добавьте ему историю.",
        description: "Соедините пейзажи, короткие видео, случайные детали и моменты между ними. Расскажите о путешествии своим голосом — вместо очередной безликой нарезки.",
      },
      proofPoints: ["Сотни разных фото и видео", "Сюжет, а не только хронология", "Для семьи, друзей или YouTube"],
      sections: [
        {
          eyebrow: "Знакомая проблема",
          title: "Поездка закончилась. Гора материалов осталась.",
          intro: "Лучшие моменты разбросаны по устройствам, а отбор превращается во вторую работу. Направляющий бриф помогает отделить будущую историю от архива.",
          items: [
            { title: "Сохраните поворотные моменты", body: "Приезд, сюрпризы, люди и перемены настроения становятся опорными точками истории." },
            { title: "Используйте детали со смыслом", body: "Еда, улицы, билеты и погода поддерживают сюжет, а не заполняют хронометраж." },
            { title: "Расскажите своим голосом", body: "Запишите то, что знаете только вы, и проверьте, как озвучка сочетается с живым звуком." },
          ],
        },
        {
          eyebrow: "Иллюстративный сценарий",
          title: "Десять дней в Грузии — одна история на вечер.",
          intro: "Вымышленный пример: 340 фото, 28 коротких видео и голосовые заметки становятся главами — ожидание, горная дорога, неожиданный ужин и тихое возвращение домой.",
          items: [
            { title: "Начните со смысла", body: "Автор решает: это история о гостеприимстве, а не перечень достопримечательностей." },
            { title: "Постройте осознанную дугу", body: "Студия предлагает сцены и темп; автор меняет порядок, удаляет лишнее и переписывает до одобрения." },
            { title: "Подготовьте выбранную версию", body: "В итоговую доставку входят только одобренные монтаж, озвучка, музыка и место публикации." },
          ],
        },
      ],
      related: ["home", "features", "personal"],
    },
    {
      key: "personal",
      path: "/ru/lichnye-videoistorii",
      seoTitle: "Личная видеоистория из семейных фото | Make It a Story",
      seoDescription: "Создайте личную или семейную видеоисторию из фото, коротких видео и своего рассказа. Понятная структура, ручное одобрение и никакого безликого слайд-шоу.",
      hero: {
        eyebrow: "Для моментов, которые принадлежат людям",
        title: "Больше, чем слайд-шоу.",
        accent: "Память с вашей точкой зрения.",
        description: "Соберите день рождения, семейную главу, год в другой стране или обычный сезон в личную видеоисторию — с контекстом и деталями, которые можете рассказать только вы.",
      },
      proofPoints: ["Личный и семейный архив", "Контекст вашими словами", "Приватность, пока вы не решите иначе"],
      sections: [
        {
          eyebrow: "Личное — по замыслу",
          title: "Смысл нельзя определить только по лицам.",
          intro: "Даты и распознавание изображений полезны, но они не знают, почему момент важен. Процесс спрашивает вас и использует ответы для организации материалов.",
          items: [
            { title: "Сохраните контекст", body: "Имена, отношения, шутки и поворотные моменты направляют монтаж, а не угадываются по изображению." },
            { title: "Выберите зрителя", body: "Истории для бабушки нужен другой ритм и пояснения, чем ролику для открытого канала." },
            { title: "Контролируйте доступ", body: "Создание истории не делает её публичной. Для публикации нужен отдельный явный выбор." },
          ],
        },
        {
          eyebrow: "Иллюстративный сценарий",
          title: "Первый год ребёнка — через маленькие открытия семьи.",
          intro: "Вымышленный пример объединяет ежемесячные фото, короткие домашние видео и рассказ родителя о переменах, которые камера сама объяснить не может.",
          items: [
            { title: "Выберите сквозную мысль", body: "Вместо одного видео на каждый месяц история показывает, как семья училась новой повседневной жизни." },
            { title: "Сохраните память в голосе", body: "Короткая озвучка добавляет имена, эмоции и контекст, а живой звук сохраняет присутствие момента." },
            { title: "Проверьте перед показом", body: "Семья просматривает каждую сцену и решает, останется ли результат приватным или будет подготовлен для выбранных зрителей." },
          ],
        },
      ],
      related: ["home", "features", "travel"],
    },
    {
      key: "features",
      path: "/ru/vozmozhnosti",
      seoTitle: "Возможности AI-студии видеоисторий | Make It a Story",
      seoDescription: "Узнайте, как организовать реальные материалы, построить сюжет, добавить свой голос, проверить творческие решения и подготовить одобренное видео.",
      hero: {
        eyebrow: "Студия помогает, но не забирает авторство",
        title: "Творческая помощь — там, где нужна.",
        accent: "Контроль — там, где важен.",
        description: "Make It a Story соединяет структурированный бриф, визуальный монтаж и AI-подсказки, чтобы вы прошли путь от переполненной папки до осмысленной истории.",
      },
      proofPoints: ["Сначала сюжет", "Бережная работа с оригиналами", "Явное одобрение перед доставкой"],
      sections: [
        {
          eyebrow: "Единый процесс",
          title: "От замысла до финальной проверки — по понятным шагам.",
          intro: "Продукт находится в раннем доступе. Возможности выходят постепенно, а открытый product roadmap показывает, что уже доступно и что появится дальше.",
          items: [
            { title: "Бриф и направление истории", body: "Определите зрителя, главную мысль, настроение и важные моменты до начала монтажа." },
            { title: "Сцены и визуальная структура", body: "Собирайте настоящие фото и видео в сцены, уточняйте кадрирование и сохраняйте исходный архив." },
            { title: "Голос, титры и звук", body: "Готовьте озвучку, текст и музыку как версионные творческие решения, а не необратимую автоматизацию." },
            { title: "Проверка и одобрение", body: "Увидьте, что именно будет доставлено, одобрите точную версию и оставьте публикацию отдельным решением." },
            { title: "AI-предложения", body: "Получайте варианты структуры, титров и темпа с возможностью изменить или отклонить каждую подсказку." },
            { title: "Несколько способов создавать", body: "Product roadmap развивает единый процесс от веб-студии к мобильному приложению и AI-ассистентам." },
          ],
        },
      ],
      related: ["travel", "personal", "home"],
      showRoadmap: true,
    },
  ],
  "sr-Latn": [
    {
      key: "home",
      path: "/sr",
      seoTitle: "AI video-priče od vaših fotografija i snimaka | Make It a Story",
      seoDescription: "Pretvorite fotografije i snimke u smislenu priču sa svojim glasom i muzikom. AI pomaže, dok materijali i konačne odluke ostaju vaši.",
      hero: {
        eyebrow: "Vaše uspomene, oblikovane sa namerom",
        title: "Ne samo niz fotografija.",
        accent: "Priča koju vi pričate.",
        description: "Pretvorite fotografije i snimke sa putovanja, proslave ili iz svakodnevnog života u celovitu priču sa svojim glasom i muzikom — bez prazne vremenske linije.",
      },
      proofPoints: ["Vaši stvarni materijali", "Vaš glas i ugao gledanja", "Priča koju vi odobravate"],
      sections: [
        {
          eyebrow: "Po čemu je drugačije",
          title: "Priča dolazi pre efekata.",
          intro: "Većina alata počinje šablonom ili praznom vremenskom linijom. Make It a Story prvo pomaže da odredite šta se desilo, zašto je važno i kome pričate.",
          items: [
            { title: "Vođeno, ne generičko", body: "Kratak kreativni brif pretvara fasciklu materijala u jasnu nit umesto nasumičnog klipa." },
            { title: "AI kao urednički pomoćnik", body: "AI predlaže strukturu, naslove i ritam, ali ne zamenjuje vaše uspomene i ne izmišlja njihov smisao." },
            { title: "Odobrenje u važnim koracima", body: "Proveravate priču, sliku, glas i muziku pre pripreme ili objave konačne verzije." },
          ],
        },
        {
          eyebrow: "Od materijala do priče",
          title: "Miran i vođen tok rada.",
          intro: "Ne morate učiti profesionalni program za montažu da biste donosili promišljene kreativne odluke.",
          items: [
            { title: "1. Dodajte trenutke", body: "Otpremite fotografije i snimke koje želite da sačuvate. Originali ostaju izvor istine." },
            { title: "2. Pronađite glavnu nit", body: "Odgovorite na nekoliko pitanja o ljudima, prekretnicama, raspoloženju i publici." },
            { title: "3. Oblikujte i odobrite", body: "Pregledajte redosled, naraciju, naslove, zvuk i isporuku pre nego što priča napusti studio." },
          ],
        },
      ],
      related: ["travel", "personal", "features"],
      showRoadmap: true,
    },
    {
      key: "travel",
      path: "/sr/price-sa-putovanja",
      seoTitle: "Pretvorite fotografije sa putovanja u video-priču | Make It a Story",
      seoDescription: "Složite fotografije i snimke sa putovanja u celovitu priču sa naracijom, muzikom i strukturom koju vi odobravate.",
      hero: {
        eyebrow: "Za putovanja vredna sećanja",
        title: "Galerija čuva put.",
        accent: "Dodajte mu priču.",
        description: "Spojite pejzaže, kratke snimke, sitne detalje i trenutke između njih. Ispričajte putovanje svojim glasom — ne generičkim nizom kadrova.",
      },
      proofPoints: ["Stotine fotografija i snimaka", "Narativ, ne samo hronologija", "Za porodicu, prijatelje ili YouTube"],
      sections: [
        {
          eyebrow: "Čest problem",
          title: "Putovanje se završi. Gomila materijala ostane.",
          intro: "Najbolji trenuci su rasuti po uređajima, a izbor postaje drugi posao. Vođeni brif odvaja buduću priču od arhive.",
          items: [
            { title: "Sačuvajte prekretnice", body: "Dolazak, iznenađenja, ljudi i promene raspoloženja postaju oslonci priče." },
            { title: "Koristite detalje sa razlogom", body: "Hrana, ulice, karte i vreme podržavaju narativ umesto da popunjavaju trajanje." },
            { title: "Ispričajte svojim glasom", body: "Zabeležite ono što samo vi znate i proverite kako se naracija slaže sa originalnim zvukom." },
          ],
        },
        {
          eyebrow: "Ilustrativni scenario",
          title: "Deset dana u Gruziji — jedna priča za jedno veče.",
          intro: "Izmišljeni primer: 340 fotografija, 28 kratkih snimaka i glasovne beleške postaju poglavlja o iščekivanju, planinskom putu, neočekivanoj večeri i povratku.",
          items: [
            { title: "Počnite od smisla", body: "Autor bira priču o gostoprimstvu, a ne spisak znamenitosti." },
            { title: "Izgradite jasan luk", body: "Studio predlaže scene i ritam; autor menja, uklanja i prepravlja pre odobrenja." },
            { title: "Pripremite izabranu verziju", body: "Samo odobrena montaža, glas, muzika i odredište ulaze u konačnu isporuku." },
          ],
        },
      ],
      related: ["home", "features", "personal"],
    },
    {
      key: "personal",
      path: "/sr/licne-video-price",
      seoTitle: "Lična video-priča od porodičnih fotografija | Make It a Story",
      seoDescription: "Napravite promišljenu ličnu ili porodičnu video-priču od fotografija, snimaka i sopstvene naracije, uz vođenu strukturu i pregled.",
      hero: {
        eyebrow: "Za trenutke koji pripadaju ljudima",
        title: "Više od slajdova.",
        accent: "Uspomena iz vašeg ugla.",
        description: "Oblikujte rođendan, porodično poglavlje, godinu u inostranstvu ili običnu sezonu u ličnu video-priču sa kontekstom koji samo vi znate.",
      },
      proofPoints: ["Lične i porodične arhive", "Kontekst vašim rečima", "Privatno dok ne odlučite drugačije"],
      sections: [
        {
          eyebrow: "Lično po zamisli",
          title: "Smisao se ne može prepoznati samo sa lica.",
          intro: "Datumi i prepoznavanje slika pomažu, ali ne znaju zašto je trenutak važan. Tok rada pita vas i koristi vaše odgovore.",
          items: [
            { title: "Sačuvajte kontekst", body: "Imena, odnosi, šale i prekretnice vode montažu umesto da budu nagađani." },
            { title: "Izaberite publiku", body: "Priča za baku traži drugačiji ritam i objašnjenje od videa za javni kanal." },
            { title: "Kontrolišite deljenje", body: "Priprema priče je ne čini javnom. Objavljivanje zahteva posebnu, jasnu odluku." },
          ],
        },
        {
          eyebrow: "Ilustrativni scenario",
          title: "Prva godina deteta kroz mala porodična otkrića.",
          intro: "Izmišljeni primer spaja mesečne fotografije, kratke kućne snimke i glas roditelja o promenama koje kamera sama ne objašnjava.",
          items: [
            { title: "Izaberite glavnu nit", body: "Umesto jednog snimka za svaki mesec, priča prati kako je porodica učila novu svakodnevicu." },
            { title: "Neka glas sačuva sećanje", body: "Kratka naracija dodaje imena, osećanja i kontekst, dok originalni zvuk čuva prisustvo." },
            { title: "Pregledajte pre deljenja", body: "Porodica proverava svaku scenu i bira da li priča ostaje privatna ili ide izabranoj publici." },
          ],
        },
      ],
      related: ["home", "features", "travel"],
    },
    {
      key: "features",
      path: "/sr/mogucnosti",
      seoTitle: "Mogućnosti AI studija za video-priče | Make It a Story",
      seoDescription: "Organizujte stvarne materijale, oblikujte narativ, dodajte svoj glas, pregledajte odluke i pripremite odobren video.",
      hero: {
        eyebrow: "Studio vodi bez preuzimanja autorstva",
        title: "Kreativna pomoć gde je potrebna.",
        accent: "Kontrola gde je važna.",
        description: "Make It a Story spaja strukturisani brif, vizuelno uređivanje i AI predloge da biste prešli od pune fascikle do namerne priče.",
      },
      proofPoints: ["Priča na prvom mestu", "Nedestruktivni izvorni materijali", "Jasno odobrenje pre isporuke"],
      sections: [
        {
          eyebrow: "Tok rada",
          title: "Jedan povezan put od brifa do završnog pregleda.",
          intro: "Proizvod je u ranom pristupu. Mogućnosti stižu korak po korak, a javni product roadmap pokazuje šta je dostupno i šta sledi.",
          items: [
            { title: "Brif i pravac priče", body: "Odredite publiku, glavnu ideju, raspoloženje i važne trenutke pre montaže." },
            { title: "Scene i vizuelna struktura", body: "Rasporedite stvarne fotografije i snimke u scene, prilagodite kadar i sačuvajte originalnu arhivu." },
            { title: "Glas, naslovi i zvuk", body: "Pripremite naraciju, tekst i muziku kao verzionisane kreativne odluke." },
            { title: "Pregled i odobrenje", body: "Vidite šta će biti isporučeno, odobrite tačnu verziju i držite objavljivanje kao posebnu odluku." },
            { title: "AI predlozi", body: "Dobijte predloge strukture, naslova i ritma uz mogućnost izmene ili odbijanja svakog predloga." },
            { title: "Više načina stvaranja", body: "Product roadmap širi isti proces sa veb-studija na mobilni uređaj i AI asistente." },
          ],
        },
      ],
      related: ["travel", "personal", "home"],
      showRoadmap: true,
    },
  ],
};

export function createPublicSite() {
  const locales = Object.fromEntries(Object.entries(shared).map(([locale, value]) => [locale, { ...value, pages: pagesByLocale[locale] }]));
  return { brand: "Make It a Story", origin: publicSiteOrigin, defaultLocale: "en", locales };
}

export const publicSite = createPublicSite();

export function listPublicPages(site = publicSite) {
  return Object.entries(site.locales).flatMap(([locale, value]) => value.pages.map((page) => ({ ...page, locale })));
}

export function getAlternatePages(pageKey, site = publicSite) {
  return Object.entries(site.locales).map(([locale, value]) => ({
    locale,
    hrefLang: value.hrefLang,
    languageName: value.languageName,
    page: value.pages.find((candidate) => candidate.key === pageKey),
  }));
}
