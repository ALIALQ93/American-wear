---
name: Luxury Arabic E-Commerce System
colors:
  surface: '#131313'
  surface-dim: '#131313'
  surface-bright: '#393939'
  surface-container-lowest: '#0e0e0e'
  surface-container-low: '#1c1b1b'
  surface-container: '#20201f'
  surface-container-high: '#2a2a2a'
  surface-container-highest: '#353535'
  on-surface: '#e5e2e1'
  on-surface-variant: '#d0c5b2'
  inverse-surface: '#e5e2e1'
  inverse-on-surface: '#313030'
  outline: '#99907e'
  outline-variant: '#4d4637'
  surface-tint: '#e6c364'
  primary: '#e6c364'
  on-primary: '#3d2e00'
  primary-container: '#c9a84c'
  on-primary-container: '#503d00'
  inverse-primary: '#755b00'
  secondary: '#c9c6c5'
  on-secondary: '#313030'
  secondary-container: '#4a4949'
  on-secondary-container: '#bab8b7'
  tertiary: '#c7c7c7'
  on-tertiary: '#2f3131'
  tertiary-container: '#abacac'
  on-tertiary-container: '#3e4041'
  error: '#ffb4ab'
  on-error: '#690005'
  error-container: '#93000a'
  on-error-container: '#ffdad6'
  primary-fixed: '#ffe08f'
  primary-fixed-dim: '#e6c364'
  on-primary-fixed: '#241a00'
  on-primary-fixed-variant: '#584400'
  secondary-fixed: '#e5e2e1'
  secondary-fixed-dim: '#c9c6c5'
  on-secondary-fixed: '#1c1b1b'
  on-secondary-fixed-variant: '#474646'
  tertiary-fixed: '#e2e2e2'
  tertiary-fixed-dim: '#c6c6c7'
  on-tertiary-fixed: '#1a1c1c'
  on-tertiary-fixed-variant: '#454747'
  background: '#131313'
  on-background: '#e5e2e1'
  surface-variant: '#353535'
typography:
  display-lg:
    fontFamily: EB Garamond
    fontSize: 48px
    fontWeight: '500'
    lineHeight: 60px
    letterSpacing: '0'
  display-lg-mobile:
    fontFamily: EB Garamond
    fontSize: 36px
    fontWeight: '500'
    lineHeight: 44px
  headline-md:
    fontFamily: EB Garamond
    fontSize: 32px
    fontWeight: '400'
    lineHeight: 40px
  headline-sm:
    fontFamily: EB Garamond
    fontSize: 24px
    fontWeight: '400'
    lineHeight: 32px
  body-lg:
    fontFamily: IBM Plex Sans Arabic
    fontSize: 18px
    fontWeight: '400'
    lineHeight: 28px
  body-md:
    fontFamily: IBM Plex Sans Arabic
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 24px
  label-md:
    fontFamily: IBM Plex Sans Arabic
    fontSize: 14px
    fontWeight: '600'
    lineHeight: 20px
  label-sm:
    fontFamily: IBM Plex Sans Arabic
    fontSize: 12px
    fontWeight: '500'
    lineHeight: 16px
spacing:
  unit: 8px
  container-max: 1440px
  gutter: 24px
  margin-desktop: 64px
  margin-mobile: 20px
---

## Brand & Style

This design system is built for the ultra-high-end Middle Eastern luxury market. It evokes a sense of exclusivity, architectural precision, and heritage through a minimalist, high-contrast lens. The aesthetic is "Digital Atelier"—where the interface acts as a silent, sophisticated gallery for high-fashion photography.

The brand personality is authoritative yet welcoming, utilizing the Right-to-Left (RTL) orientation not just as a localization requirement, but as the foundational structural logic. Visual cues are taken from premium fashion editorial: generous negative space, razor-sharp edges, and a restrained use of gold as a "signature" rather than a primary filler. The emotional response should be one of "effortless prestige."

## Colors

The palette is intentionally restricted to maintain a high-fashion editorial feel.

- **Primary (Elegant Gold):** Used exclusively for calls to action, active states, and high-importance highlights. It represents the "touch of gold" found in luxury craftsmanship.
- **Background (Deep Black):** The primary canvas. This creates a "darkroom" effect that allows product photography colors to pop with intense vibrancy.
- **Contrast (Pure White):** Used for primary body text and secondary background blocks (such as product detail containers or administrative tables) to ensure maximum legibility.
- **Surface (Neutral Grey):** A subtle variation of black (#1A1A1A) used for card backgrounds and input fields to provide depth without breaking the high-contrast aesthetic.

## Typography

The typography system pairs the classical elegance of a Serif font with the technical precision of a Modern Sans-Serif, specifically optimized for Arabic script.

- **Headings:** Utilize **EB Garamond** (for Latin) and an **Amiri-style Serif** for Arabic. These fonts should be used for product names, editorial titles, and section headers to convey a sense of history and craftsmanship.
- **Body & UI:** Utilize **IBM Plex Sans Arabic**. This provides a clean, neutral, and highly legible experience for product descriptions, navigation, and administrative data.
- **RTL Considerations:** Line heights are increased by approximately 15% for Arabic text compared to standard Latin defaults to accommodate the tall ascenders and descenders of the script.

## Layout & Spacing

The layout follows a **Fixed Grid** system centered on the screen, reflecting the curated nature of a luxury boutique. 

- **Desktop:** A 12-column grid with a maximum width of 1440px. Gutters are kept wide (24px) to ensure breathing room between product cards.
- **RTL Flow:** All layout logic is mirrored. Navigation starts from the right, sidebars are positioned on the right, and "next" actions point to the left.
- **Whitespace:** Use "Generous Padding" as a luxury indicator. Product details should have at least 80px of vertical separation between major sections.

## Elevation & Depth

This system avoids traditional shadows in favor of **Structural Depth**. 

- **Subtle Borders:** Instead of shadows, use 1px solid borders in Elegant Gold (#C9A84C) at 30% opacity or Pure White at 10% opacity to define boundaries.
- **Tonal Layering:** Use the Neutral Grey (#1A1A1A) for secondary surfaces like hover states on cards or navigation dropdowns.
- **Glassmorphism:** Reserved strictly for the navigation bar—a 10px backdrop blur with a 15% opacity Deep Black fill, creating a "floating" effect as the user scrolls through the visual-heavy content.

## Shapes

The shape language is **Sharp and Architectural**. 

All buttons, cards, and input fields utilize 0px border-radius. Sharp corners communicate precision, high-end tailoring, and a modern "edge." Any departure from sharp corners (e.g., circular icons) should be used sparingly and only for functional elements like pagination dots or color swatches.

## Components

### Navigation
- **Global Header:** Centered logo with the menu items split or balanced on the right (RTL). Search and Bag icons occupy the far left.
- **Hover States:** Links transition from White to Gold with a 0.3s ease. A 1px gold underline grows from the center outwards on hover.

### Product Cards
- **Visuals:** Full-bleed imagery with no visible border until hover.
- **Interaction:** On hover, a 1px Gold border appears, and the secondary product image fades in. Product name and price are right-aligned.

### Buttons
- **Primary:** Elegant Gold background, Deep Black text, sharp corners. High-glaze finish effect (subtle linear gradient).
- **Secondary:** Ghost style, 1px White border, White text.

### Administrative Dashboard
- **Data Tables:** Pure White background with Deep Black text. Headers are in Gold bold-caps (Label-md).
- **Stats Cards:** Minimalist blocks with large Display-lg numbers. Trend indicators (up/down) use Gold for positive growth rather than traditional green to maintain the palette.

### Tabbed Subcategories
- Underlined style. The active tab features a 2px Gold underline, while inactive tabs remain muted at 50% opacity.