import { describe, expect, it } from 'vitest'
import { metaDesignTokens, researchBenefits, researchNavItems } from '@/lib/ui/meta-design'

describe('Meta design implementation contract', () => {
  it('keeps the documented brand tokens and geometry', () => {
    expect(metaDesignTokens.colors.primary).toBe('#0064e0')
    expect(metaDesignTokens.colors.inkButton).toBe('#000000')
    expect(metaDesignTokens.colors.canvas).toBe('#ffffff')
    expect(metaDesignTokens.rounded.full).toBe('100px')
    expect(metaDesignTokens.rounded.xxxl).toBe('32px')
  })

  it('exposes the responsive navigation and four research benefit surfaces', () => {
    expect(researchNavItems).toEqual(['Research', 'Memory', 'Sources'])
    expect(researchBenefits).toHaveLength(4)
    expect(researchBenefits.map(([number]) => number)).toEqual(['01', '02', '03', '04'])
  })
})
