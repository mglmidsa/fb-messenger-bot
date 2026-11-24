/**
 * Business facts the bot is allowed to use. The bot answers ONLY from this text;
 * anything not covered here is handed to a human.
 *
 * Fill in the sections below (or set the BUSINESS_KNOWLEDGE env var, which overrides this file).
 * Keep it factual and current — wrong prices here mean wrong prices to customers.
 */
export const DEFAULT_KNOWLEDGE = `
# Бизнесийн нэр
[Бизнесийн нэр]

# Юу хийдэг вэ
[Үндсэн бүтээгдэхүүн / үйлчилгээ 2-3 өгүүлбэрээр]

# Ажиллах цаг
[Даваа–Баасан 09:00–18:00, Бямба ..., Ням амарна]

# Хаяг, холбоо барих
[Хаяг, утас, имэйл, вэб]

# Үнэ
[Бүтээгдэхүүн/үйлчилгээ — үнэ ₮]

# Захиалга, хүргэлт, төлбөр
[Хэрхэн захиалах, хүргэлтийн нөхцөл, төлбөрийн хэлбэр]

# Түгээмэл асуулт
- Асуулт: ...
  Хариулт: ...
`.trim();

export function getKnowledge(override?: string): string {
  return override && override.trim() ? override.trim() : DEFAULT_KNOWLEDGE;
}

/** True while the knowledge text still contains unfilled [placeholders]. */
export function knowledgeIsPlaceholder(text: string): boolean {
  return /\[Бизнесийн нэр\]/.test(text);
}
