/** COC 7th 调查员角色卡相关类型 */

export interface COCAttributes {
  str: number
  con: number
  siz: number
  dex: number
  app: number
  int: number
  pow: number
  edu: number
  luck: number
}

/** 职业技能分配：8 个职业技能 + 信用评级，共 9 个数值：70, 60, 60, 50, 50, 50, 40, 40, 40 */
export const OCCUPATION_SKILL_VALUES = [70, 60, 60, 50, 50, 50, 40, 40, 40] as const

/** 兴趣技能：任选 4 个非职业技能，每个在基础值上 +20% */
export const PERSONAL_INTEREST_BONUS = 20
export const PERSONAL_INTEREST_COUNT = 4

/** 衍生数值：HP/MP/SAN 在游戏中会变化 */
export interface COCDerivedStats {
  hp: number
  hpMax: number
  mp: number
  mpMax: number
  san: number
  sanMax: number
}

export interface COCCharacterSheet {
  occupationId: string
  occupationName: string
  playerName: string
  attributes: COCAttributes
  /** 技能名 -> 百分比 (含职业分配与兴趣+20%，游戏中可能成长) */
  skills: Record<string, number>
  /** 已分配的 9 个职业技能键（含 Credit Rating） */
  occupationSkillKeys: string[]
  /** 已选的 4 个兴趣技能键 */
  personalInterestKeys: string[]
  /** 衍生数值（HP/MP/SAN 可随游戏变化） */
  derived: COCDerivedStats
}

export type GamePhase =
  | 'script_selected'   // 已选剧本，未选职业
  | 'occupation_selected' // 已选职业，未完成角色卡
  | 'character_ready'    // 角色卡完成，未进入游戏
  | 'playing'            // 游戏中，AI KP 已启动
