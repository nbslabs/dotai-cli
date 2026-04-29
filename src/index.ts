import yargs from 'yargs'
import { hideBin } from 'yargs/helpers'

import { initCommand } from './commands/init'
import { linkCommand } from './commands/link'
import { unlinkCommand } from './commands/unlink'
import { statusCommand } from './commands/status'
import { addCommand } from './commands/add'
import { removeCommand } from './commands/remove'
import { listCommand } from './commands/list'
import { syncCommand } from './commands/sync'
import { doctorCommand } from './commands/doctor'
import { knowledgeCommand } from './commands/knowledge'
import { sddCommand } from './commands/sdd'
import { upgradeCommand } from './commands/upgrade'
import { mcpCommand } from './commands/mcp'
import { skillCommand } from './commands/skill'
import { ruleCommand } from './commands/rule'
import { cmdCommand } from './commands/cmd'
import { configCommand } from './commands/config-cmd'
import { VERSION } from './version'

const cli = yargs(hideBin(process.argv))
  .scriptName('dotai')
  .usage('$0 <command> [options]')
  .version(VERSION)
  .alias('v', 'version')
  .help()
  .alias('h', 'help')
  .command(initCommand)
  .command(linkCommand)
  .command(unlinkCommand)
  .command(statusCommand)
  .command(addCommand)
  .command(removeCommand)
  .command(listCommand)
  .command(syncCommand)
  .command(doctorCommand)
  .command(knowledgeCommand)
  .command(sddCommand)
  .command(upgradeCommand)
  .command(mcpCommand)
  .command(skillCommand)
  .command(ruleCommand)
  .command(cmdCommand)
  .command(configCommand)
  .demandCommand(1, 'Specify a command. Run `dotai --help` for usage.')
  .strict()

cli.parse()
