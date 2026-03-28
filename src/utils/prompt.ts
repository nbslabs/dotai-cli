import { checkbox, input, confirm } from '@inquirer/prompts'

export async function promptCheckbox<T extends string>(
  message: string,
  choices: { name: string; value: T; checked?: boolean }[]
): Promise<T[]> {
  return checkbox<T>({
    message,
    choices: choices.map((c) => ({
      name: c.name,
      value: c.value,
      checked: c.checked ?? false,
    })),
  })
}

export async function promptInput(
  message: string,
  defaultValue?: string
): Promise<string> {
  return input({
    message,
    default: defaultValue,
  })
}

export async function promptConfirm(
  message: string,
  defaultValue = true
): Promise<boolean> {
  return confirm({
    message,
    default: defaultValue,
  })
}
