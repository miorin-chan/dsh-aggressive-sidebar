import { KNOBS_LOCALES, withKnobsLabels } from '@miorin/dsh-plugin-knobs-ui'

export const LOCALES = KNOBS_LOCALES

const en = {
  sectionTitle: 'Sidebar layout',
  mode: 'Opening mode',
  fullscreen: 'Fullscreen',
  leftSidebar: 'Left sidebar',
  leftSidebarHint: 'Expands the right panel up to the left sidebar edge.',
  fullscreenHint: 'Expands the right panel across the entire window.',
}

export const LABELS = withKnobsLabels({
  en,
  zh: {
    sectionTitle: '侧栏展开',
    mode: '展开模式',
    fullscreen: '全屏',
    leftSidebar: '到左边栏',
    leftSidebarHint: '右侧面板展开至左侧边栏边缘，保留左边栏可见。',
    fullscreenHint: '右侧面板铺满整个窗口区域。',
  },
  ja: {
    sectionTitle: 'サイドバー展開',
    mode: '展開モード',
    fullscreen: '全画面',
    leftSidebar: '左サイドバー',
    leftSidebarHint: '右パネルを左サイドバーの端まで広げ、左サイドバーを残します。',
    fullscreenHint: '右パネルをウィンドウ全体に広げます。',
  },
  de: {
    sectionTitle: 'Seitenleisten-Layout',
    mode: 'Öffnungsmodus',
    fullscreen: 'Vollbild',
    leftSidebar: 'Linke Leiste',
    leftSidebarHint: 'Erweitert das rechte Panel bis zur linken Seitenleiste.',
    fullscreenHint: 'Erweitert das rechte Panel über das gesamte Fenster.',
  },
  es: {
    sectionTitle: 'Diseño lateral',
    mode: 'Modo de apertura',
    fullscreen: 'Pantalla completa',
    leftSidebar: 'Barra lateral',
    leftSidebarHint: 'Amplía el panel derecho hasta el borde de la barra lateral izquierda.',
    fullscreenHint: 'Amplía el panel derecho a toda la ventana.',
  },
  fr: {
    sectionTitle: 'Disposition latérale',
    mode: 'Mode d’ouverture',
    fullscreen: 'Plein écran',
    leftSidebar: 'Barre latérale',
    leftSidebarHint: 'Étend le panneau droit jusqu’au bord de la barre latérale gauche.',
    fullscreenHint: 'Étend le panneau droit sur toute la fenêtre.',
  },
  pt: {
    sectionTitle: 'Layout lateral',
    mode: 'Modo de abertura',
    fullscreen: 'Tela cheia',
    leftSidebar: 'Barra lateral',
    leftSidebarHint: 'Expande o painel direito até a borda da barra lateral esquerda.',
    fullscreenHint: 'Expande o painel direito por toda a janela.',
  },
  ru: {
    sectionTitle: 'Режим панели',
    mode: 'Режим открытия',
    fullscreen: 'На весь экран',
    leftSidebar: 'До левой панели',
    leftSidebarHint: 'Разворачивает правую панель до края левой боковой панели.',
    fullscreenHint: 'Разворачивает правую панель на всё окно.',
  },
} satisfies Record<(typeof LOCALES)[number], Record<keyof typeof en, string>>)

export type LabelKey = keyof typeof LABELS.en
