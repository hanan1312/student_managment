export type ThemePalette = {
  key: string;
  label: string;
  description: string;
  colors: {
    50: string;
    100: string;
    500: string;
    600: string;
    700: string;
    800: string;
    900: string;
  };
};

export const THEME_PALETTES: ThemePalette[] = [
  {
    key: "default",
    label: "الياقوت الليلي",
    description: "أزرق ملكي داكن مع لمسات ذهبية — المظهر الكلاسيكي.",
    colors: {
      50: "#eef4ff",
      100: "#dbe6fe",
      500: "#3f63e0",
      600: "#3151c4",
      700: "#2a44a3",
      800: "#22357d",
      900: "#1a2860",
    },
  },
  {
    key: "emerald",
    label: "الزمرد الفاخر",
    description: "أخضر زمردي غني مع لمسات ذهبية — راقٍ وأكاديمي.",
    colors: {
      50: "#ecfdf5",
      100: "#d1fae5",
      500: "#129e74",
      600: "#0f8862",
      700: "#0c6f50",
      800: "#09563e",
      900: "#073f2d",
    },
  },
  {
    key: "burgundy",
    label: "العنابي التراثي",
    description: "عنابي داكن مع لمسات ذهبية — فخم ودافئ.",
    colors: {
      50: "#fdf2f4",
      100: "#fbdfe4",
      500: "#a52f4c",
      600: "#8a2440",
      700: "#6f1c33",
      800: "#551527",
      900: "#3c0f1c",
    },
  },
];

export const DEFAULT_THEME_KEY = THEME_PALETTES[0].key;

export function applyThemePalette(key: string | null | undefined) {
  const resolved = THEME_PALETTES.some((p) => p.key === key) ? (key as string) : DEFAULT_THEME_KEY;
  document.documentElement.setAttribute("data-theme", resolved);
}
