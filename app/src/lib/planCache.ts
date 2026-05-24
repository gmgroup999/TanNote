const KEY = 'tannote_plan';

export function getPlanCache(): string {
  return localStorage.getItem(KEY) ?? 'free';
}

export function setPlanCache(plan: string): void {
  localStorage.setItem(KEY, plan);
}
