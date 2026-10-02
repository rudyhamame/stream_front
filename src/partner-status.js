export function describePartnerStatus({ checked, error, linked, online }) {
  if (error) return { state: 'unknown', label: 'Status unavailable', detail: 'Unable to check partner status. Retrying automatically.' };
  if (!checked) return { state: 'checking', label: 'Checking…', detail: 'Checking your partner’s selected profile.' };
  if (!linked) return { state: 'unlinked', label: 'Not linked', detail: 'Both profiles must save each other’s account email and exact profile code.' };
  if (online) return { state: 'online', label: 'Online', detail: 'Your partner’s selected profile checked in within the last 30 seconds.' };
  return { state: 'offline', label: 'Offline', detail: 'No recent activity from your partner’s selected profile. Status updates every 10 seconds.' };
}
