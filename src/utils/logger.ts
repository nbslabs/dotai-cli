import pc from 'picocolors'

export const logger = {
  info: (msg: string) => {
    console.log(`  ${pc.cyan('✦')} ${msg}`)
  },

  success: (msg: string) => {
    console.log(`  ${pc.green('✓')} ${msg}`)
  },

  warn: (msg: string) => {
    console.log(`  ${pc.yellow('⚠')} ${msg}`)
  },

  error: (msg: string) => {
    console.log(`  ${pc.red('✗')} ${msg}`)
  },

  dim: (msg: string) => {
    console.log(`  ${pc.gray(msg)}`)
  },

  title: (msg: string) => {
    console.log(`\n  ${pc.bold(pc.white(msg))}`)
  },

  newline: () => {
    console.log()
  },

  plain: (msg: string) => {
    console.log(`  ${msg}`)
  },

  table: (rows: string[][]) => {
    for (const row of rows) {
      console.log(`  ${row.join('  ')}`)
    }
  },
}
