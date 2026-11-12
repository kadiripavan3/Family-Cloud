// Generated from design/tokens.json by scripts/build-theme.mjs. Do not edit: change the tokens and run `npm run theme`.

export const accentName = "sun" as const;

/** The app's name, its web address, and the icon its mark is drawn with. */
export const brand = {
  "name": "Homeport",
  "domain": "homeport.app",
  "icon": "anchor"
} as const;

/** What the places in Home's top row are called, where the name is a setting. */
export const places = {
  "notes": "Notes"
} as const;

/**
 * Colours, by name. `tint1` to `tint5` tell people and categories apart where a name or a face won't fit
 * (a dot in the month grid, a bar in a chart): always beside a label, never the only signal, never for buttons.
 */
export const palettes = {
  "light": {
    "bg": "#FFFFFF",
    "surface": "#FFFFFF",
    "fill": "#F3F3F6",
    "fill2": "#E6E6EC",
    "line": "#E9E9EE",
    "lineStrong": "#C2C2CB",
    "text": "#141418",
    "muted": "#6B6B75",
    "like": "#FF2D55",
    "ok": "#149A4E",
    "warn": "#B26B00",
    "done": "#2F6BF5",
    "danger": "#D92D20",
    "onDanger": "#FFFFFF",
    "glass": "rgba(255, 255, 255, .64)",
    "glassLine": "rgba(255, 255, 255, .85)",
    "glassStrong": "rgba(255, 255, 255, .86)",
    "gbtn": "rgba(255, 255, 255, .84)",
    "gbtnFg": "#141418",
    "mapLand": "#EEF0F2",
    "mapWater": "#CCE3EE",
    "mapPark": "#DBEBD3",
    "mapRoad": "#FFFFFF",
    "mapRoad2": "#DFE2E7",
    "mapLabel": "#6F7580",
    "tint1": "#F2684A",
    "tint2": "#2E90FA",
    "tint3": "#12A66A",
    "tint4": "#8B63F0",
    "tint5": "#E5478F",
    "accent": "#FFC21A",
    "onAccent": "#1A1400",
    "accentText": "#8A5A00",
    "accentSoft": "#FFF3CC",
    "onPhoto": "#FFFFFF",
    "photoGlass": "rgba(16, 16, 20, .36)",
    "photoGlassLine": "rgba(255, 255, 255, .24)",
    "photoTint": "rgba(16, 16, 20, .22)",
    "stage": "#08080A",
    "black": "#000000",
    "white": "#FFFFFF",
    "scrim": "rgba(0, 0, 0, .44)"
  },
  "dark": {
    "bg": "#0B0B0E",
    "surface": "#18181E",
    "fill": "#202027",
    "fill2": "#2C2C35",
    "line": "#2A2A33",
    "lineStrong": "#45454F",
    "text": "#F5F5F7",
    "muted": "#A3A3AE",
    "like": "#FF375F",
    "ok": "#3DDC84",
    "warn": "#FFB547",
    "done": "#7FA2FF",
    "danger": "#FF6B5E",
    "onDanger": "#2A0A06",
    "glass": "rgba(30, 30, 38, .56)",
    "glassLine": "rgba(255, 255, 255, .10)",
    "glassStrong": "rgba(26, 26, 32, .86)",
    "gbtn": "rgba(24, 24, 30, .56)",
    "gbtnFg": "#FFFFFF",
    "mapLand": "#1A1D22",
    "mapWater": "#0E2231",
    "mapPark": "#16291C",
    "mapRoad": "#2D323B",
    "mapRoad2": "#23272E",
    "mapLabel": "#8E95A2",
    "tint1": "#FF8A6E",
    "tint2": "#6CB4FF",
    "tint3": "#4FD795",
    "tint4": "#A994FF",
    "tint5": "#FF7FB5",
    "accent": "#FFC21A",
    "onAccent": "#1A1400",
    "accentText": "#FFD46A",
    "accentSoft": "#33290A",
    "onPhoto": "#FFFFFF",
    "photoGlass": "rgba(16, 16, 20, .36)",
    "photoGlassLine": "rgba(255, 255, 255, .24)",
    "photoTint": "rgba(16, 16, 20, .22)",
    "stage": "#08080A",
    "black": "#000000",
    "white": "#FFFFFF",
    "scrim": "rgba(0, 0, 0, .44)"
  }
} as const;

/**
 * Shadows as CSS box-shadow values: "md" lifts cards and bars, "sm" outlines quiet surfaces. The rest are the same
 * in light and dark: under a sheet, under a switch's knob, around a picture that overlaps a photo, under a card on the stage.
 */
export const shadows = {
  "light": {
    "md": "0 12px 32px rgba(20, 20, 32, .13), 0 2px 6px rgba(20, 20, 32, .06)",
    "sm": "0 4px 16px rgba(20, 20, 32, .08), 0 0 0 1px rgba(20, 20, 32, .04)",
    "sheet": "0 -12px 40px rgba(0, 0, 0, .2)",
    "knob": "0 2px 4px rgba(0, 0, 0, .2)",
    "float": "0 6px 16px rgba(0, 0, 0, .16)",
    "stage": "0 30px 60px -20px rgba(0, 0, 0, .6)"
  },
  "dark": {
    "md": "0 12px 32px rgba(0, 0, 0, .55), 0 2px 6px rgba(0, 0, 0, .4)",
    "sm": "0 0 0 1px rgba(255, 255, 255, .06)",
    "sheet": "0 -12px 40px rgba(0, 0, 0, .2)",
    "knob": "0 2px 4px rgba(0, 0, 0, .2)",
    "float": "0 6px 16px rgba(0, 0, 0, .16)",
    "stage": "0 30px 60px -20px rgba(0, 0, 0, .6)"
  }
} as const;

export const radius = {
  "chip": 8,
  "tile": 12,
  "thumb": 14,
  "field": 16,
  "photo": 18,
  "card": 20,
  "cardLarge": 22,
  "panel": 24,
  "stage": 28,
  "sheet": 30,
  "pill": 999
} as const;

/** The spacing scale, in points. */
export const space = [4,8,12,16,20,24,32,40,48] as const;

/** Where a screen's content starts from the edge ("gutter" for text and cards, "rowGutter" for full-width rows, "barGutter" for bars and rails), and the room above a section. */
export const layout = {"gutter":22,"rowGutter":20,"barGutter":16,"section":24} as const;

export const type = {
  "hero": {
    "fontSize": 41,
    "lineHeight": 42,
    "weight": 800,
    "letterSpacing": -1.6
  },
  "displayLarge": {
    "fontSize": 36,
    "lineHeight": 38,
    "weight": 800,
    "letterSpacing": -1.3
  },
  "display": {
    "fontSize": 34,
    "lineHeight": 36,
    "weight": 800,
    "letterSpacing": -1.36
  },
  "heading": {
    "fontSize": 31,
    "lineHeight": 35,
    "weight": 800,
    "letterSpacing": -1.2
  },
  "titleLarge": {
    "fontSize": 27,
    "lineHeight": 30,
    "weight": 800,
    "letterSpacing": -0.95
  },
  "title": {
    "fontSize": 23,
    "lineHeight": 27,
    "weight": 800,
    "letterSpacing": -0.69
  },
  "titleSmall": {
    "fontSize": 20,
    "lineHeight": 25,
    "weight": 800,
    "letterSpacing": -0.5
  },
  "subtitle": {
    "fontSize": 19,
    "lineHeight": 24,
    "weight": 800,
    "letterSpacing": -0.4
  },
  "subheading": {
    "fontSize": 17,
    "lineHeight": 22,
    "weight": 800,
    "letterSpacing": -0.34
  },
  "headline": {
    "fontSize": 16,
    "lineHeight": 21,
    "weight": 700,
    "letterSpacing": -0.24
  },
  "bodyLarge": {
    "fontSize": 16,
    "lineHeight": 24,
    "weight": 500,
    "letterSpacing": 0
  },
  "lead": {
    "fontSize": 15.5,
    "lineHeight": 23,
    "weight": 500,
    "letterSpacing": 0
  },
  "body": {
    "fontSize": 15,
    "lineHeight": 22,
    "weight": 500,
    "letterSpacing": 0
  },
  "item": {
    "fontSize": 15,
    "lineHeight": 20,
    "weight": 700,
    "letterSpacing": 0
  },
  "bodySmall": {
    "fontSize": 14.5,
    "lineHeight": 22,
    "weight": 500,
    "letterSpacing": 0
  },
  "control": {
    "fontSize": 14.5,
    "lineHeight": 20,
    "weight": 700,
    "letterSpacing": 0
  },
  "callout": {
    "fontSize": 14,
    "lineHeight": 20,
    "weight": 500,
    "letterSpacing": 0
  },
  "note": {
    "fontSize": 13.5,
    "lineHeight": 19,
    "weight": 500,
    "letterSpacing": 0
  },
  "caption": {
    "fontSize": 13,
    "lineHeight": 18,
    "weight": 600,
    "letterSpacing": 0
  },
  "footnote": {
    "fontSize": 12.5,
    "lineHeight": 17,
    "weight": 500,
    "letterSpacing": 0
  },
  "small": {
    "fontSize": 12,
    "lineHeight": 16,
    "weight": 600,
    "letterSpacing": 0
  },
  "tiny": {
    "fontSize": 11.5,
    "lineHeight": 14,
    "weight": 700,
    "letterSpacing": 0
  },
  "label": {
    "fontSize": 11.5,
    "lineHeight": 14,
    "weight": 800,
    "letterSpacing": 0.81,
    "uppercase": true
  },
  "micro": {
    "fontSize": 10.5,
    "lineHeight": 13,
    "weight": 800,
    "letterSpacing": 0
  }
} as const;

/** Motion: how far a pressed thing shrinks, and durations in milliseconds. "stagger" is the gap between list items entering. */
export const motion = {
  "pressScale": 0.97,
  "quick": 160,
  "base": 240,
  "slow": 600,
  "stagger": 45
} as const;
