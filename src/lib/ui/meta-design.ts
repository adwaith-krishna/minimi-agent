export const metaDesignTokens = {
  colors: {
    primary: '#0064e0',
    primaryDeep: '#0457cb',
    onPrimary: '#ffffff',
    inkButton: '#000000',
    onInkButton: '#ffffff',
    canvas: '#ffffff',
    surfaceSoft: '#f1f4f7',
    inkDeep: '#0a1317',
    ink: '#1c1e21',
    charcoal: '#444950',
    steel: '#5d6c7b',
    stone: '#8595a4',
    hairline: '#ced0d4',
    hairlineSoft: '#dee3e9',
    disabledText: '#bcc0c4',
    critical: '#e41e3f',
  },
  rounded: {
    lg: '8px',
    xl: '16px',
    xxl: '24px',
    xxxl: '32px',
    full: '100px',
    circle: '9999px',
  },
} as const

export const researchNavItems = ['Research', 'Memory', 'Sources'] as const

export const researchBenefits = [
  ['01', 'Remembered context', 'Bring earlier conversations and saved research into the answer.'],
  ['02', 'Current evidence', 'Search the web only when the question needs a fresh check.'],
  ['03', 'Clear comparisons', 'See what changed, what stayed true, and what remains uncertain.'],
  ['04', 'Honest answers', 'Every conclusion is grounded in visible evidence and citations.'],
] as const
