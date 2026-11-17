// The City's old address while it was being built (FE-51): it now lives at /, so this only forwards, keeping the
// query (site, time, customers, fps, sel) for bookmarks and the screenshot script.

import { redirect } from "next/navigation";

export default async function CityPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(await searchParams)) for (const one of [v].flat()) if (one !== undefined) params.append(k, one);
  const query = params.toString();
  redirect(query ? `/?${query}` : "/");
}
