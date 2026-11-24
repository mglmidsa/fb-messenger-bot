# Production-д оруулах: гараар хийх алхмууд

Доорх алхмууд таны Vercel, Upstash, Anthropic, Telegram, Meta бүртгэл шаарддаг. Үлдсэн шалгалт, тестийг Claude хийнэ.
Нууц утгуудыг (token, key, secret) зөвхөн Vercel → Settings → **Environment Variables**-д оруулна. GitHub, чат, файлд бүү бич.

## 1. Vercel project (2 минут)
1. vercel.com/new → **Import Git Repository** → `mglmidsa/fb-messenger-bot`. Vercel GitHub-д хандах эрх асуувал энэ repo-г зөвшөөрнө.
2. Team: **Midas** → **Deploy**. Нууц утгагүйгээр ч build амжилттай болно.
3. Project → **Domains** хэсгээс production хаягийг хуулж авна, жишээ нь `https://fb-messenger-bot.vercel.app`. Цаашид үүнийг `<ДОМЭЙН>` гэж бичнэ.

## 2. Redis (1 минут)
Vercel → **Storage** → **Create Database** → **Upstash for Redis** (Free) → `fb-messenger-bot` project-д холбоно (бүх environment). Env prefix-ийг өөрчлөхгүй, анхдагчаар нь үлдээнэ.

## 3. Claude API түлхүүр
platform.claude.com → **API Keys → Create key**. **Billing → Spend limit**-д сарын хязгаар тавина ($10).

## 4. Telegram
1. Telegram → @BotFather → `/newbot` → token-ыг хуулна.
2. Зөвхөн ажилтнууд байх **хаалттай групп** үүсгээд ботоо нэмнэ. Группт нэг мессеж бичнэ.

## 5. Vercel орчны хувьсагчид (Production)
| Нэр | Утга |
|---|---|
| `WEBHOOK_VERIFY_TOKEN` | Claude-ын өгсөн утга |
| `CRON_SECRET` | Claude-ын өгсөн утга |
| `ADMIN_TOOLS` | `true` (тест дууссаны дараа `false`) |
| `ANTHROPIC_API_KEY` | 3-р алхмын key |
| `TELEGRAM_BOT_TOKEN` | 4-р алхмын token |
| `TELEGRAM_CHAT_ID` | Группын ID (`-` тэмдгээр эхэлдэг). web.telegram.org дээр группээ нээхэд хаягийн мөрөнд `#-…` гэж харагдана. Эсвэл Claude `/api/setup/telegram`-аас олж өгнө. |
| `META_APP_SECRET`, `PAGE_ACCESS_TOKEN`, `PAGE_ID` | 6-р алхмаас |

Хувьсагч нэмсний дараа **Deployments → ⋯ → Redeploy** хийнэ.

## 6. Meta (Facebook) апп
1. developers.facebook.com → **Create App** → use case: **Engage with customers on Messenger from Meta** → пэйжийг эзэмшдэг business portfolio-г сонгоно.
2. **App settings → Basic**:
   - **App Secret** → Vercel `META_APP_SECRET`
   - **Privacy Policy URL**: `<ДОМЭЙН>/privacy`
   - **User data deletion → Data deletion instructions URL**: `<ДОМЭЙН>/privacy#delete`
3. **Messenger API Settings → Generate access tokens** → пэйжийг холбоно → **Generate** → token → Vercel `PAGE_ACCESS_TOKEN`. Пэйжийн ID → Vercel `PAGE_ID`. → **Redeploy**.
4. **Configure webhooks**: Callback URL `<ДОМЭЙН>/api/webhook`, Verify token = `WEBHOOK_VERIFY_TOKEN` → **Verify and save**.
5. **Webhook subscriptions** → пэйжийн хажууд **Add subscriptions** → `messages`, `messaging_postbacks`.
6. Аппыг **Live (Published)** горимд шилжүүлнэ. Аппад эрхгүй хүнд бот хариулахгүй байвал **App Review**-ээр `pages_messaging`-ийн Advanced Access-ийг хүснэ.

## 7. Claude-д «бэлэн» гэж хэлнэ
Claude production дээр дараах зүйлсийг шалгана: нууцлалын хуудас, webhook-ийн баталгаажуулалт, page token, webhook бүртгэл, Telegram, Redis. Мөн ажилтнуудын группт тест мэдэгдэл илгээж, монгол хэлний тестийг ажиллуулна.

## 8. Бодит яриагаар төгсгөлөөс төгсгөл хүртэл тест
1. Өөрийн Facebook бүртгэлээс пэйж рүү: «Сайн байна уу» → чиглэл → утасны дугаар.
2. Аппад эрхгүй өөр бүртгэлээс мөн адил бичнэ.
3. Telegram групп руу «📞 Шинэ хүсэлт» ирснийг баталгаажуулна.
4. Тест дууссаны дараа `ADMIN_TOOLS=false` болгоод Redeploy хийнэ.

> Vercel Hobby нь арилжааны бус хэрэглээнд зориулагдсан. Бизнесийн ботод Pro багц тохиромжтой. Pro дээр `vercel.json`-ийн cron-ийг `*/5 * * * *` болговол хүрээгүй хүсэлтийг 5 минут тутам дахин илгээнэ.
