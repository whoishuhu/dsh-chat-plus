export const railLabels = {
  en: turn => ({ nav: 'Turn navigation', button: `Jump to turn ${turn}` }),
  zh: turn => ({ nav: '回合导航', button: `跳转到第 ${turn} 轮` }),
  ja: turn => ({ nav: 'ターン ナビゲーション', button: `ターン ${turn} へ移動` }),
  es: turn => ({ nav: 'Navegación de turnos', button: `Ir al turno ${turn}` }),
  fr: turn => ({ nav: 'Navigation des tours', button: `Aller au tour ${turn}` }),
  de: turn => ({ nav: 'Rundennavigation', button: `Zu Runde ${turn} springen` }),
  ru: turn => ({ nav: 'Навигация по ходам', button: `Перейти к ходу ${turn}` }),
  pt: turn => ({ nav: 'Navegação de turnos', button: `Ir para o turno ${turn}` }),
}

export function railSelectors(turn) {
  return Object.values(railLabels).map(format => {
    const { nav, button } = format(turn)
    return `nav[aria-label="${nav}"] button[aria-label="${button}"]`
  })
}
