/**
 * COC 7th 规则数据（职业与技能）
 * 参考：Chaosium 7th Edition Rulebook / Investigator Handbook
 */

export interface COCSkillDef {
  id: string
  name: string
  /** 基础百分比（未受训时的默认值） */
  base: number
}

/** 人际技能（职业中「任选其一」） */
export const INTERPERSONAL_SKILL_IDS = ['Charm', 'Fast Talk', 'Intimidate', 'Persuade'] as const

/** COC 7th 标准技能表（含基础值） */
export const COC7_SKILLS: COCSkillDef[] = [
  { id: 'Accounting', name: '会计', base: 5 },
  { id: 'Anthropology', name: '人类学', base: 1 },
  { id: 'Appraise', name: '估价', base: 5 },
  { id: 'Archaeology', name: '考古学', base: 1 },
  { id: 'Art/Craft', name: '艺术/手艺', base: 5 },
  { id: 'Charm', name: '魅惑', base: 15 },
  { id: 'Climb', name: '攀爬', base: 20 },
  { id: 'Credit Rating', name: '信用评级', base: 0 },
  { id: 'Disguise', name: '乔装', base: 5 },
  { id: 'Dodge', name: '闪避', base: 0 }, // 通常为 DEX/2，创建时可选
  { id: 'Drive Auto', name: '驾驶(汽车)', base: 20 },
  { id: 'Electrical Repair', name: '电气维修', base: 10 },
  { id: 'Fast Talk', name: '话术', base: 5 },
  { id: 'Fighting', name: '斗殴', base: 25 },
  { id: 'Firearms', name: '枪械', base: 20 },
  { id: 'First Aid', name: '急救', base: 30 },
  { id: 'History', name: '历史', base: 5 },
  { id: 'Intimidate', name: '恐吓', base: 15 },
  { id: 'Jump', name: '跳跃', base: 20 },
  { id: 'Language (Other)', name: '其他语言', base: 1 },
  { id: 'Language (Own)', name: '母语', base: 0 }, // 等于 EDU
  { id: 'Law', name: '法律', base: 5 },
  { id: 'Library Use', name: '图书馆使用', base: 20 },
  { id: 'Listen', name: '聆听', base: 20 },
  { id: 'Locksmith', name: '锁匠', base: 1 },
  { id: 'Mechanical Repair', name: '机械维修', base: 10 },
  { id: 'Medicine', name: '医学', base: 1 },
  { id: 'Natural World', name: '博物学', base: 10 },
  { id: 'Navigate', name: '导航', base: 10 },
  { id: 'Occult', name: '神秘学', base: 5 },
  { id: 'Operate Heavy Machinery', name: '操作重型机械', base: 1 },
  { id: 'Persuade', name: '说服', base: 10 },
  { id: 'Pilot', name: '驾驶(船/飞机等)', base: 1 },
  { id: 'Psychoanalysis', name: '精神分析', base: 1 },
  { id: 'Psychology', name: '心理学', base: 10 },
  { id: 'Ride', name: '骑术', base: 5 },
  { id: 'Science', name: '科学', base: 1 },
  { id: 'Sleight of Hand', name: '妙手', base: 10 },
  { id: 'Spot Hidden', name: '侦查', base: 25 },
  { id: 'Stealth', name: '潜行', base: 20 },
  { id: 'Survival', name: '生存', base: 10 },
  { id: 'Swim', name: '游泳', base: 20 },
  { id: 'Throw', name: '投掷', base: 20 },
  { id: 'Track', name: '追踪', base: 10 },
]

const skillNameMap = new Map(COC7_SKILLS.map((s) => [s.id, s.name]))

/** 根据技能 ID 返回中文名称（调查员手册标准） */
export function getSkillName(skillId: string): string {
  return skillNameMap.get(skillId) ?? skillId
}

/** 职业定义：skillTemplate 为技能 id，或 'interpersonal'（从 Charm/Fast Talk/Intimidate/Persuade 选一），或 'any'（从全表选一） */
export interface COCOccupationDef {
  id: string
  name: string
  nameEn: string
  skillTemplate: readonly string[]
}

/** COC 7th 职业（规则书/调查员手册） */
export const COC7_OCCUPATIONS: COCOccupationDef[] = [
  { id: 'accountant', name: '会计师', nameEn: 'Accountant', skillTemplate: ['Accounting', 'Law', 'Library Use', 'Listen', 'Persuade', 'Psychology', 'Spot Hidden', 'any'] },
  { id: 'antiquarian', name: '古董商', nameEn: 'Antiquarian', skillTemplate: ['Appraise', 'Art/Craft', 'History', 'Library Use', 'Language (Other)', 'interpersonal', 'Spot Hidden', 'any'] },
  { id: 'archaeologist', name: '考古学家', nameEn: 'Archaeologist', skillTemplate: ['Anthropology', 'Archaeology', 'History', 'Language (Other)', 'Library Use', 'Spot Hidden', 'Survival', 'any'] },
  { id: 'artist', name: '艺术家', nameEn: 'Artist', skillTemplate: ['Art/Craft', 'History', 'Natural World', 'Occult', 'Persuade', 'Psychology', 'Spot Hidden', 'any'] },
  { id: 'author', name: '作家', nameEn: 'Author', skillTemplate: ['Art/Craft', 'History', 'Library Use', 'Natural World', 'Language (Other)', 'Language (Own)', 'Psychology', 'any'] },
  { id: 'bartender', name: '酒保', nameEn: 'Bartender', skillTemplate: ['Accounting', 'Charm', 'Fast Talk', 'Fighting', 'Listen', 'Psychology', 'Spot Hidden', 'any'] },
  { id: 'criminal', name: '罪犯', nameEn: 'Criminal', skillTemplate: ['Fighting', 'Climb', 'Disguise', 'Locksmith', 'Stealth', 'Fast Talk', 'Firearms', 'any'] },
  { id: 'dilettante', name: '纨绔子弟', nameEn: 'Dilettante', skillTemplate: ['Art/Craft', 'Firearms', 'Language (Other)', 'Ride', 'interpersonal', 'any', 'any', 'any'] },
  { id: 'doctor', name: '医生', nameEn: 'Doctor of Medicine', skillTemplate: ['First Aid', 'Language (Other)', 'Medicine', 'Psychology', 'Science', 'Science', 'any', 'any'] },
  { id: 'driver', name: '司机', nameEn: 'Driver', skillTemplate: ['Drive Auto', 'Electrical Repair', 'Mechanical Repair', 'Navigate', 'Spot Hidden', 'Stealth', 'Fighting', 'any'] },
  { id: 'engineer', name: '工程师', nameEn: 'Engineer', skillTemplate: ['Electrical Repair', 'Library Use', 'Mechanical Repair', 'Operate Heavy Machinery', 'Science', 'Spot Hidden', 'Stealth', 'any'] },
  { id: 'journalist', name: '记者', nameEn: 'Journalist', skillTemplate: ['Art/Craft', 'History', 'Library Use', 'Language (Own)', 'interpersonal', 'Psychology', 'any', 'any'] },
  { id: 'lawyer', name: '律师', nameEn: 'Lawyer', skillTemplate: ['Accounting', 'Law', 'Library Use', 'Persuade', 'Psychology', 'Fast Talk', 'Spot Hidden', 'any'] },
  { id: 'librarian', name: '图书馆员', nameEn: 'Librarian', skillTemplate: ['History', 'Language (Other)', 'Library Use', 'Occult', 'Persuade', 'Psychology', 'Spot Hidden', 'any'] },
  { id: 'nurse', name: '护士', nameEn: 'Nurse', skillTemplate: ['First Aid', 'Medicine', 'Listen', 'Psychology', 'Spot Hidden', 'Stealth', 'Persuade', 'any'] },
  { id: 'occultist', name: '神秘学家', nameEn: 'Occultist', skillTemplate: ['History', 'Library Use', 'Language (Other)', 'Occult', 'Psychology', 'Spot Hidden', 'any', 'any'] },
  { id: 'photographer', name: '摄影师', nameEn: 'Photographer', skillTemplate: ['Art/Craft', 'Spot Hidden', 'Navigate', 'Stealth', 'Listen', 'Psychology', 'Drive Auto', 'any'] },
  { id: 'pilot', name: '飞行员', nameEn: 'Pilot', skillTemplate: ['Electrical Repair', 'Mechanical Repair', 'Navigate', 'Pilot', 'Science', 'Spot Hidden', 'Swim', 'any'] },
  { id: 'police_detective', name: '警探', nameEn: 'Police Detective', skillTemplate: ['Disguise', 'Firearms', 'Law', 'Listen', 'interpersonal', 'Psychology', 'Spot Hidden', 'any'] },
  { id: 'private_investigator', name: '私家侦探', nameEn: 'Private Investigator', skillTemplate: ['Art/Craft', 'Disguise', 'Law', 'Library Use', 'interpersonal', 'Psychology', 'Spot Hidden', 'any'] },
  { id: 'professor', name: '教授', nameEn: 'Professor', skillTemplate: ['Library Use', 'Language (Other)', 'Language (Own)', 'Psychology', 'any', 'any', 'any', 'any'] },
  { id: 'sailor', name: '水手', nameEn: 'Sailor', skillTemplate: ['Climb', 'Electrical Repair', 'Fighting', 'Firearms', 'Mechanical Repair', 'Navigate', 'Swim', 'any'] },
  { id: 'scientist', name: '科学家', nameEn: 'Scientist', skillTemplate: ['Library Use', 'Language (Other)', 'Science', 'Science', 'Spot Hidden', 'any', 'any', 'any'] },
  { id: 'soldier', name: '士兵', nameEn: 'Soldier', skillTemplate: ['Climb', 'Dodge', 'Fighting', 'Firearms', 'First Aid', 'Language (Other)', 'Stealth', 'Survival'] },
  { id: 'student', name: '学生', nameEn: 'Student', skillTemplate: ['Art/Craft', 'History', 'Library Use', 'Language (Other)', 'Language (Own)', 'Psychology', 'any', 'any'] },
]

/** 属性投掷：STR/CON/DEX/APP/POW/Luck 用 3d6×5；SIZ/INT/EDU 用 (2d6+6)×5（规则书标准） */
export const COC7_ATTRIBUTE_IDS = ['str', 'con', 'siz', 'dex', 'app', 'int', 'pow', 'edu', 'luck'] as const
export type COCAttributeId = (typeof COC7_ATTRIBUTE_IDS)[number]

/** 投一颗 d6 */
export function rollD6(): number {
  return Math.floor(Math.random() * 6) + 1
}

/** 投 3d6 */
export function roll3d6(): number {
  return rollD6() + rollD6() + rollD6()
}

/** 投 2d6 */
export function roll2d6(): number {
  return rollD6() + rollD6()
}

/** 3d6×5，范围 15–90（STR/CON/DEX/APP/POW/Luck） */
export function rollAttribute3d6(): number {
  return roll3d6() * 5
}

/** (2d6+6)×5，范围 40–90（SIZ/INT/EDU） */
export function rollAttribute2d6p6(): number {
  return (roll2d6() + 6) * 5
}

/** 生成全部 9 项属性（规则书标准） */
export function rollAllAttributes(): Record<COCAttributeId, number> {
  return {
    str: rollAttribute3d6(),
    con: rollAttribute3d6(),
    siz: rollAttribute2d6p6(),
    dex: rollAttribute3d6(),
    app: rollAttribute3d6(),
    int: rollAttribute2d6p6(),
    pow: rollAttribute3d6(),
    edu: rollAttribute2d6p6(),
    luck: rollAttribute3d6(),
  }
}
