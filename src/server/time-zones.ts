export function toStoredTimeZone(input: string): string | undefined {
  const value = input.trim().replaceAll("−", "-");
  const fixedOffset = /^UTC\s*([+-])\s*(\d{1,2})(?::?(\d{2}))?$/i.exec(value);

  if (fixedOffset) {
    const hours = Number(fixedOffset[2]);
    const minutes = Number(fixedOffset[3] || 0);
    if (hours > 14 || minutes !== 0 || (hours === 14 && minutes !== 0)) return undefined;
    if (hours === 0) return "UTC";
    const ianaSign = fixedOffset[1] === "-" ? "+" : "-";
    return `Etc/GMT${ianaSign}${hours}`;
  }

  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value }).format();
    return value;
  } catch {
    return undefined;
  }
}

export function toTimeZoneInput(storedValue: string): string {
  const fixedOffset = /^Etc\/GMT([+-])(\d{1,2})$/i.exec(storedValue);
  if (!fixedOffset) return storedValue;
  const userSign = fixedOffset[1] === "+" ? "-" : "+";
  return `UTC ${userSign}${fixedOffset[2]}`;
}
