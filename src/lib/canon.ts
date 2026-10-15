// Канон канала — всё, что одинаково во всех роликах и раньше вписывалось руками в формы:
// строка стиля, шаблон анимации, правила озвучки Eleven v3, синтаксис меток монтажа.
// Значения по умолчанию взяты из локального конвейера ~/illustrated-ages-pipeline
// (videos/*/style.md, CLAUDE.md) и мастер-промпта v7. Кнопка «Подтянуть из конвейера»
// перечитывает их с диска.

export type Canon = {
  /** Дописывается дословно в конец каждого промпта картинки. Уже содержит формат кадра и запрет текста. */
  styleLine: string;
  /** То же для вертикальных шортсов. */
  styleLineVertical: string;
  /** Шаблон промпта Veo; <MOTION> заменяется конкретным движением. */
  animTemplate: string;
  /** Правила подачи текста для Eleven v3: теги, пунктуация, числа. */
  voiceRules: string;
  /** Метки монтажа в колонке notes — их читает tools/montage.py. */
  notesSyntax: string;
  /** Как вписывать персонажей в промпт. */
  characterRule: string;
  /** Музыка в ролике: в конвейере её нет, только голос и звуковые эффекты. */
  music: boolean;
  /** Папка локального конвейера на Mac. */
  pipelineDir: string;
  source: { importedFrom: string | null; importedAt: string | null };
};

export const DEFAULT_STYLE_LINE =
  "flat 2D hand-drawn cartoon illustration, bold slightly uneven black ink outlines, flat colors, plain off-white background, 16:9 horizontal composition, centered subject, plenty of negative space, no text, no labels, no captions";

export const DEFAULT_CANON: Canon = {
  styleLine: DEFAULT_STYLE_LINE,
  styleLineVertical:
    "flat 2D hand-drawn cartoon illustration, bold slightly uneven black ink outlines, flat colors, plain off-white background, 9:16 vertical composition, subject fills the frame, key action in the middle, no important details in the top 15% and bottom 25%, no text, no labels, no captions",
  animTemplate:
    "Animate this flat 2D hand-drawn cartoon, perfectly preserving the original art style, line work, colors and composition. Subtle limited motion only: <MOTION>. Camera locked, no zoom, no pan. No new objects, no style change, no morphing, no 3D, no realism, no added text or sound. Smooth looping 2D motion, ~5 seconds.",
  voiceRules: [
    "Озвучка под Eleven v3. Теги в квадратных скобках перед фразой, к которой относятся: подача [whispers], [tense], [ominous], [calm], [urgent]; звуки [sighs], [exhales], [gulps]; паузы [short pause], [long pause]. Не больше одного-двух тегов на кадр и только там, где они меняют подачу. Холодный спокойный голос — напряжение даёт текст.",
    "Пунктуация — режиссура: «...» пауза перед раскрытием, «—» обрыв, КАПС на одном слове — ударение (редко).",
    "Числа и даты словами, как их надо произнести («twenty thousand», «two p.m.», «around twenty-five sixty BC»). Без сокращений и скобок, кроме тегов. Теги в субтитры не попадают.",
  ].join("\n"),
  notesSyntax: [
    "Метки монтажа в поле «Монтаж» (несколько — через « · »):",
    "⏱ 05:00 — часы в начале акта + whip-переход",
    "🛡 3/7 — счётчик «Threats survived 3 / 7»",
    "☠ Cause of death: dirty water — карточка вердикта (до 6 слов)",
    "📌 ДАТА: 1453 · 📌 ЧИСЛО: 77 men · 📌 СУММА: $10,000 — акцент штампом",
    "📌 ДОКУМЕНТ: The Ship's Articles · 📌 КАРТА: Nile delta — акцент печатной машинкой или прорисовкой",
    "📍 Giza, Egypt, 2560 BC — подпись места и времени (место и год — подписью, не голосом)",
    "💥 — удар: тряска кадра + звук",
    "Музыки нет: метки 🎵 не пишутся.",
  ].join("\n"),
  characterRule:
    "Персонаж вписывается в промпт его описанием из шага 5 слово в слово, в круглых скобках сразу после первого упоминания: «(Emperor Constantine XI, an elderly man with a short grey beard, …) stands …». Группы — во множественном числе тем же описанием.",
  music: false,
  pipelineDir: "~/illustrated-ages-pipeline",
  source: { importedFrom: null, importedAt: null },
};

/** Строка стиля проекта: переопределение в параметрах ролика или канон. */
export function effectiveStyle(canon: Canon, params: { styleBlock?: string; styleOverride?: boolean }, vertical = false) {
  if (params.styleOverride && params.styleBlock?.trim()) return params.styleBlock.trim();
  return vertical ? canon.styleLineVertical : canon.styleLine;
}

export function animPrompt(canon: Canon, motion: string) {
  return canon.animTemplate.replace("<MOTION>", motion);
}
