#!/usr/bin/env node
/**
 * Нэг удаа өөрийн компьютер дээр ажиллуулна:
 *   META_APP_ID=... META_APP_SECRET=... USER_TOKEN=... node scripts/get-page-token.mjs [PAGE_ID]
 *
 * 1) Graph API Explorer-оос авсан богино хугацааны USER_TOKEN-ыг урт хугацааных болгоно
 * 2) Таны удирддаг пэйжүүдийн жагсаалт, хугацаагүй Page token-ыг гаргана
 * 3) PAGE_ID өгвөл тэр пэйжийг энэ аппын messages webhook-д бүртгэнэ
 *
 * Token-ууд зөвхөн таны терминал дээр гарна. Тэдгээрийг хэнд ч бүү илгээ, зөвхөн Vercel-ийн env-д хуулна.
 */
const { META_APP_ID, META_APP_SECRET, USER_TOKEN } = process.env;
const VERSION = process.env.GRAPH_API_VERSION || "v26.0";
const pageArg = process.argv[2];

if (!META_APP_ID || !META_APP_SECRET || !USER_TOKEN) {
  console.error("META_APP_ID, META_APP_SECRET, USER_TOKEN гурвыг env-ээр өгнө үү.");
  process.exit(1);
}

const base = `https://graph.facebook.com/${VERSION}`;
async function call(path, params, method = "GET") {
  const url = new URL(`${base}/${path}`);
  const body = new URLSearchParams(params);
  const res = method === "GET"
    ? await fetch(`${url}?${body}`)
    : await fetch(url, { method, body });
  const json = await res.json();
  if (json.error) throw new Error(`${json.error.message} (code ${json.error.code})`);
  return json;
}

const longUser = await call("oauth/access_token", {
  grant_type: "fb_exchange_token",
  client_id: META_APP_ID,
  client_secret: META_APP_SECRET,
  fb_exchange_token: USER_TOKEN,
});
console.log("✓ Урт хугацааны user token авлаа");

const accounts = await call("me/accounts", { access_token: longUser.access_token, fields: "id,name,access_token,tasks" });
if (!accounts.data?.length) {
  console.error("Пэйж олдсонгүй. Token авахдаа pages_show_list, pages_messaging, pages_manage_metadata эрх сонгосон эсэхээ шалгана уу.");
  process.exit(1);
}

for (const p of accounts.data) {
  console.log(`\n— ${p.name}\n  PAGE_ID=${p.id}\n  эрхүүд: ${(p.tasks || []).join(", ")}`);
}

const page = pageArg ? accounts.data.find((p) => p.id === pageArg) : accounts.data.length === 1 ? accounts.data[0] : null;
if (!page) {
  console.log("\nАль пэйжийг холбохоо сонгоод дахин ажиллуулна уу:  node scripts/get-page-token.mjs <PAGE_ID>");
  process.exit(0);
}

const debug = await call("debug_token", { input_token: page.access_token, access_token: `${META_APP_ID}|${META_APP_SECRET}` });
const exp = debug.data?.expires_at;
console.log(`\n✓ ${page.name} — token хугацаа: ${exp === 0 ? "хугацаагүй" : new Date(exp * 1000).toISOString()}`);
console.log(`  эрхүүд: ${(debug.data?.scopes || []).join(", ")}`);

await call(`${page.id}/subscribed_apps`, {
  access_token: page.access_token,
  subscribed_fields: "messages,messaging_postbacks",
}, "POST");
console.log("✓ Пэйжийг messages webhook-д бүртгэлээ");

console.log("\nVercel → Settings → Environment Variables-д хуулах:");
console.log(`PAGE_ID=${page.id}`);
console.log(`PAGE_ACCESS_TOKEN=${page.access_token}`);
