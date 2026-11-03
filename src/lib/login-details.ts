/**
 * "Copy login details" (HR/Admin): the welcome message to send a new joiner.
 * Only copied to the clipboard; the password is never stored or logged.
 */
export function loginDetailsText(e: { name: string; id: string; email?: string | null }, password: string) {
  return [
    `Hi ${e.name} 👋`,
    "",
    "Your ePanel login is ready.",
    "",
    `Name - ${e.name}`,
    `Employee Code - ${e.id}`,
    ...(e.email?.trim() ? [`Email - ${e.email.trim()}`] : []),
    `Pass - ${password}`,
    "",
    "Login: https://epanel.yes2broker.in",
    "Guide video: https://drive.google.com/file/d/14-41c2ryNT7VuapClt3Ue-KAqMBEfnJj/view",
    "",
    "📱 Put ePanel on your phone:",
    "Android: open the link in Chrome → ⋮ → Install app",
    "iPhone: open in Safari → Share → Add to Home Screen",
    "",
    "Please change your password after first login (Profile → Change password).",
    "For help: HR 95125 98982",
  ].join("\n");
}

export async function copyLoginDetails(e: { name: string; id: string; email?: string | null }, password: string) {
  await navigator.clipboard.writeText(loginDetailsText(e, password));
}
