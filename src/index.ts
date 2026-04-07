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
  .demandCommand(1, 'Specify a command. Run `dotai --help` for usage.')
  .strict()

cli.parse()
