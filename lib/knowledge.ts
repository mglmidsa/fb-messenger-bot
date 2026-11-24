/**
 * Business facts the bot is allowed to use. The bot answers ONLY from this text;
 * anything not covered here is left to the staff member who calls the customer back.
 *
 * Edit the text below (or set the BUSINESS_KNOWLEDGE env var, which overrides this file).
 * Keep it factual and current.
 */
export const DEFAULT_KNOWLEDGE = `
# Бид юу хийдэг вэ
Эрүүл мэндийн (эмнэлгийн) чиглэлийн тусгай зөвшөөрөл авахыг хүсэж буй хүн, байгууллагад тусгай зөвшөөрөл авахад туслах үйлчилгээ үзүүлдэг.

# Хэрэглэгчтэй хэрхэн ажилладаг вэ
Messenger-ээр хэрэглэгч ямар чиглэлийн тусгай зөвшөөрөл сонирхож байгааг болон утасны дугаарыг нь авна. Дараа нь манай ажилтан өөрөө залгаж, дэлгэрэнгүй ярилцана.

# Messenger-ээр өгөхгүй мэдээлэл
- Хаяг, утасны дугаар: манай ажилтан хэрэглэгч рүү өөрөө залгана.
- Үнэ, хугацаа, бүрдүүлэх бичиг баримт, шаардлага: мэргэжилтэн утсаар тайлбарлана.
`.trim();

export function getKnowledge(override?: string): string {
  return override && override.trim() ? override.trim() : DEFAULT_KNOWLEDGE;
}

/** True while the knowledge text still contains the unfilled template placeholder. */
export function knowledgeIsPlaceholder(text: string): boolean {
  return /\[Бизнесийн нэр\]/.test(text);
}
