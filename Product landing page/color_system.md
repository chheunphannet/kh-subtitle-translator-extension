# khtranslator UI Design System & Color Palette

This document defines the complete color system, surface tokens, text hierarchies, and styling guidelines used across the **khtranslator** extension UI and landing pages.

---

## 1. Brand & Accent Colors

| Role | HEX / Value | Preview | CSS / AntD Token | Usage |
| :--- | :--- | :---: | :--- | :--- |
| **Primary Accent** | `#E54D2E` | 🔴 | `colorPrimary` / `--accent-color` | Primary action buttons, active tab indicators, links, progress bars |
| **Accent Hover** | `#F7684A` | 🟠 | `--accent-hover` | Button hover state, interactive element focus |
| **Accent Soft (Bg)** | `rgba(229, 77, 46, 0.10)` | 🟤 | `itemSelectedBg` / `--accent-soft` | Selected segmented control, active pills, light tag backgrounds |

---

## 2. Dark Surfaces & Layering

The UI utilizes an obsidian dark mode hierarchy to establish visual depth and contrast.

| Layer Level | HEX / Value | CSS / AntD Token | Usage |
| :--- | :--- | :--- | :--- |
| **Base Canvas** | `#0E0F12` | `colorBgBase` / `--bg-color` | Main body/popup root background (Deep Charcoal / Obsidian) |
| **Container Surface** | `#16181D` | `colorBgContainer` / `--card-bg` | Cards, input fields, Dragger upload areas, settings blocks |
| **Elevated Surface** | `#1B1E24` | `colorBgElevated` | Dropdown menus, select popovers, tooltips, modals |
| **Borders & Dividers**| `rgba(245, 240, 230, 0.10)`| `colorBorder` / `--border-color` | Card outlines, horizontal separators, input borders |

---

## 3. Typography & Text Hierarchy

Text styling is configured with warm off-white tones for high readability against dark surfaces.

| Hierarchy Level | Value | AntD Token / CSS | Usage |
| :--- | :--- | :--- | :--- |
| **Text Primary (Base)** | `#F2EEE6` | `colorTextBase` / `--text-main` | Main titles, form labels, active button text (Warm Cream) |
| **Text Secondary / Muted**| `rgba(242, 238, 230, 0.65)`| `colorTextSecondary` / `--text-muted` | Helper descriptions, subtitles, parameter notes, placeholders |
| **Text Disabled** | `rgba(242, 238, 230, 0.35)`| `colorTextDisabled` | Disabled buttons, inactive manga upload state |

---

## 4. Status & Feedback Colors

| Status | Color (HEX) | Background Tint | Usage |
| :--- | :--- | :--- | :--- |
| **Success / Detection** | `#6B8E5A` / `#30A46C` | `rgba(107, 142, 90, 0.10)` | "Manga Detected!", "Subtitles Detected!" badges & cards |
| **Error / Alert** | `#E5484D` | `rgba(229, 72, 77, 0.10)` | API error notices, connection failure alerts, validation warnings |
| **Info / Notice** | `#3B82F6` | `rgba(59, 130, 246, 0.10)` | Update banners, informative tooltips |

---

## 5. UI Elements & Scrollbars

| Component | Value | Usage |
| :--- | :--- | :--- |
| **Scrollbar Track** | `#141414` | Scrollbar groove background |
| **Scrollbar Thumb** | `#434343` | Default scrollbar handle |
| **Scrollbar Thumb Hover** | `#595959` | Hovered scrollbar handle |

---

## 6. Typography Stack

```css
font-family: 'Kantumruy Pro', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
```

*   **Primary Web Font:** `Kantumruy Pro` (supporting both Khmer `U+1780-17FF` and Latin scripts).
*   **Fallback Stack:** Apple System Font, Segoe UI, Roboto.

---

## 7. Implementation Snippet (Ant Design ConfigProvider)

```typescript
export const appTheme = {
  algorithm: theme.darkAlgorithm,
  token: {
    fontFamily: "'Kantumruy Pro', sans-serif",
    colorPrimary: '#E54D2E',
    colorBgBase: '#0E0F12',
    colorBgContainer: '#16181D',
    colorBgElevated: '#1B1E24',
    colorTextBase: '#F2EEE6',
    colorBorder: 'rgba(245, 240, 230, 0.10)'
  },
  components: {
    Segmented: {
      itemSelectedBg: 'rgba(229, 77, 46, 0.10)',
      itemSelectedColor: '#E54D2E',
      trackBg: 'transparent',
      itemHoverBg: 'transparent'
    }
  }
};
```
