import raw from '../../data/program.json'
import { Program } from '../schema/index.ts'

/**
 * The seed, validated without throwing. main.tsx reads seedError before anything that needs the
 * program is loaded, so a seed that fails validation shows a readable screen instead of a blank one.
 */
const parsed = Program.safeParse(raw)

export const seedError: string | null = parsed.success ? null : parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')

export const seedProgram: Program | null = parsed.success ? parsed.data : null
