/**
 * Browsers may clear a site's saved data when space runs low, and Safari clears it after 7 days
 * without a visit. Asking for persistent storage stops the first and, in recent Safari, often the
 * second. Browsers decide for themselves, so the app never relies on the answer.
 */

/** Ask the browser to keep the app's data. True when it has agreed. */
export async function keepDataOnThisDevice(): Promise<boolean> {
  try {
    if (await navigator.storage?.persisted?.()) return true
    return (await navigator.storage?.persist?.()) ?? false
  } catch {
    return false
  }
}

/** Whether the browser has agreed to keep the app's data (false when unknown) */
export async function isDataKept(): Promise<boolean> {
  try {
    return (await navigator.storage?.persisted?.()) ?? false
  } catch {
    return false
  }
}
